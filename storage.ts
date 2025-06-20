import {
  users,
  courseProgress,
  achievements,
  quizAttempts,
  dailyActivity,
  practiceQuestions,
  type User,
  type InsertUser,
  type CourseProgress,
  type InsertCourseProgress,
  type Achievement,
  type InsertAchievement,
  type QuizAttempt,
  type InsertQuizAttempt,
  type DailyActivity,
  type InsertDailyActivity,
  type PracticeQuestion,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  
  // Course progress
  getCourseProgress(userId: number, topicId?: string): Promise<CourseProgress[]>;
  updateCourseProgress(userId: number, topicId: string, updates: Partial<InsertCourseProgress>): Promise<CourseProgress>;
  
  // Achievements
  getUserAchievements(userId: number): Promise<Achievement[]>;
  updateAchievement(userId: number, achievementType: string, progress: number): Promise<Achievement>;
  unlockAchievement(userId: number, achievementType: string): Promise<Achievement>;
  
  // Quiz attempts
  saveQuizAttempt(attempt: InsertQuizAttempt): Promise<QuizAttempt>;
  getQuizAttempts(userId: number, topicId?: string): Promise<QuizAttempt[]>;
  
  // Daily activity
  updateDailyActivity(userId: number, activity: Partial<InsertDailyActivity>): Promise<DailyActivity>;
  getDailyActivity(userId: number, days?: number): Promise<DailyActivity[]>;
  
  // Practice questions
  getPracticeQuestions(topicId: string, difficulty?: number): Promise<PracticeQuestion[]>;
  
  // Dashboard data
  getDashboardData(userId: number): Promise<{
    user: User;
    progress: CourseProgress[];
    achievements: Achievement[];
    recentActivity: DailyActivity[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    
    // Initialize default achievements for new user
    await this.initializeUserAchievements(user.id);
    
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getCourseProgress(userId: number, topicId?: string): Promise<CourseProgress[]> {
    if (topicId) {
      return await db.select().from(courseProgress)
        .where(and(eq(courseProgress.userId, userId), eq(courseProgress.topicId, topicId)));
    }
    
    return await db.select().from(courseProgress).where(eq(courseProgress.userId, userId));
  }

  async updateCourseProgress(userId: number, topicId: string, updates: Partial<InsertCourseProgress>): Promise<CourseProgress> {
    // Check if progress exists
    const existing = await db
      .select()
      .from(courseProgress)
      .where(and(eq(courseProgress.userId, userId), eq(courseProgress.topicId, topicId)))
      .limit(1);

    if (existing.length > 0) {
      const [progress] = await db
        .update(courseProgress)
        .set({ ...updates, lastAccessed: new Date() })
        .where(and(eq(courseProgress.userId, userId), eq(courseProgress.topicId, topicId)))
        .returning();
      return progress;
    } else {
      const [progress] = await db
        .insert(courseProgress)
        .values({
          userId,
          topicId,
          ...updates,
        })
        .returning();
      return progress;
    }
  }

  async getUserAchievements(userId: number): Promise<Achievement[]> {
    return await db.select().from(achievements).where(eq(achievements.userId, userId));
  }

  async updateAchievement(userId: number, achievementType: string, progress: number): Promise<Achievement> {
    const [achievement] = await db
      .update(achievements)
      .set({ progress })
      .where(and(eq(achievements.userId, userId), eq(achievements.achievementType, achievementType)))
      .returning();
    return achievement;
  }

  async unlockAchievement(userId: number, achievementType: string): Promise<Achievement> {
    const [achievement] = await db
      .update(achievements)
      .set({ unlocked: true, unlockedAt: new Date() })
      .where(and(eq(achievements.userId, userId), eq(achievements.achievementType, achievementType)))
      .returning();
    
    // Award XP for unlocking achievement
    if (achievement.xpReward > 0) {
      await db
        .update(users)
        .set({ 
          totalXp: sql`${users.totalXp} + ${achievement.xpReward}`,
          level: sql`FLOOR(${users.totalXp} / 100) + 1`
        })
        .where(eq(users.id, userId));
    }
    
    return achievement;
  }

  async saveQuizAttempt(attempt: InsertQuizAttempt): Promise<QuizAttempt> {
    const [quizAttempt] = await db
      .insert(quizAttempts)
      .values(attempt)
      .returning();
    
    // Update course progress
    await this.updateCourseProgress(attempt.userId, attempt.topicId, {
      score: attempt.score,
      questionsCorrect: attempt.questionsCorrect,
      questionsTotal: attempt.questionsTotal,
      completed: Number(attempt.score) >= 70,
      difficulty: attempt.difficulty,
    });
    
    // Update daily activity
    await this.updateDailyActivity(attempt.userId, {
      questionsAnswered: attempt.questionsTotal,
      timeSpent: Math.floor(attempt.timeSpent / 60),
      xpEarned: Math.floor(Number(attempt.score)),
    });
    
    return quizAttempt;
  }

  async getQuizAttempts(userId: number, topicId?: string): Promise<QuizAttempt[]> {
    const query = db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId)).orderBy(desc(quizAttempts.completedAt));
    
    if (topicId) {
      return await query.where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.topicId, topicId)));
    }
    
    return await query;
  }

  async updateDailyActivity(userId: number, activity: Partial<InsertDailyActivity>): Promise<DailyActivity> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existing = await db
      .select()
      .from(dailyActivity)
      .where(and(eq(dailyActivity.userId, userId), eq(dailyActivity.date, today)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(dailyActivity)
        .set({
          questionsAnswered: sql`${dailyActivity.questionsAnswered} + ${activity.questionsAnswered || 0}`,
          timeSpent: sql`${dailyActivity.timeSpent} + ${activity.timeSpent || 0}`,
          xpEarned: sql`${dailyActivity.xpEarned} + ${activity.xpEarned || 0}`,
          streakMaintained: true,
        })
        .where(eq(dailyActivity.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [newActivity] = await db
        .insert(dailyActivity)
        .values({
          userId,
          date: today,
          questionsAnswered: activity.questionsAnswered || 0,
          timeSpent: activity.timeSpent || 0,
          xpEarned: activity.xpEarned || 0,
          streakMaintained: true,
        })
        .returning();
      
      // Update user streak
      await this.updateUserStreak(userId);
      
      return newActivity;
    }
  }

  async getDailyActivity(userId: number, days: number = 7): Promise<DailyActivity[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await db
      .select()
      .from(dailyActivity)
      .where(and(eq(dailyActivity.userId, userId), sql`${dailyActivity.date} >= ${startDate}`))
      .orderBy(desc(dailyActivity.date));
  }

  async getPracticeQuestions(topicId: string, difficulty?: number): Promise<PracticeQuestion[]> {
    const query = db.select().from(practiceQuestions).where(eq(practiceQuestions.topicId, topicId));
    
    if (difficulty) {
      return await query.where(and(eq(practiceQuestions.topicId, topicId), eq(practiceQuestions.difficulty, difficulty)));
    }
    
    return await query;
  }

  async getDashboardData(userId: number) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const progress = await this.getCourseProgress(userId);
    const userAchievements = await this.getUserAchievements(userId);
    const recentActivity = await this.getDailyActivity(userId, 7);
    
    // Calculate overall grade
    const completedCourses = progress.filter(p => p.completed);
    const totalScore = completedCourses.reduce((sum, p) => sum + Number(p.score), 0);
    const overallGrade = completedCourses.length > 0 ? totalScore / completedCourses.length : 0;
    
    // Update user's overall grade
    if (overallGrade !== Number(user.overallGrade)) {
      await this.updateUser(userId, { overallGrade: overallGrade.toString() });
    }
    
    return {
      user: { ...user, overallGrade: overallGrade.toString() },
      progress,
      achievements: userAchievements,
      recentActivity,
    };
  }

  private async initializeUserAchievements(userId: number) {
    const defaultAchievements = [
      {
        userId,
        achievementType: 'number_master',
        title: 'Number Master',
        description: 'Complete the Numbers topic',
        icon: '🔢',
        maxProgress: 1,
        xpReward: 100,
      },
      {
        userId,
        achievementType: 'perfect_score',
        title: 'Perfect Score',
        description: 'Get 100% on 5 topics',
        icon: '⭐',
        maxProgress: 5,
        xpReward: 250,
      },
      {
        userId,
        achievementType: 'streak_master',
        title: 'Streak Master',
        description: '7 day learning streak',
        icon: '🔥',
        maxProgress: 7,
        xpReward: 200,
      },
      {
        userId,
        achievementType: 'math_graduate',
        title: 'Math Graduate',
        description: 'Complete all 8 topics',
        icon: '🎓',
        maxProgress: 8,
        xpReward: 500,
      },
    ];

    await db.insert(achievements).values(defaultAchievements);
  }

  private async updateUserStreak(userId: number) {
    const activities = await this.getDailyActivity(userId, 30);
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    // Calculate streaks
    for (let i = 0; i < activities.length; i++) {
      if (activities[i].streakMaintained) {
        tempStreak++;
        if (i === 0) currentStreak = tempStreak;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 0;
      }
    }
    
    longestStreak = Math.max(longestStreak, tempStreak);
    
    await this.updateUser(userId, {
      currentStreak,
      longestStreak,
      lastActiveDate: new Date(),
    });
  }
}

export const storage = new DatabaseStorage();
