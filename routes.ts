import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertQuizAttemptSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // User management
  app.get('/api/users/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const userData = req.body;
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      console.error('Failed to create user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // Dashboard data
  app.get('/api/dashboard/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const dashboardData = await storage.getDashboardData(userId);
      res.json(dashboardData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  // Course progress
  app.get('/api/progress/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const topicId = req.query.topicId as string;
      const progress = await storage.getCourseProgress(userId, topicId);
      res.json(progress);
    } catch (error) {
      console.error('Failed to fetch progress:', error);
      res.status(500).json({ error: 'Failed to fetch progress' });
    }
  });

  app.put('/api/progress/:userId/:topicId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const topicId = req.params.topicId;
      const updates = req.body;
      const progress = await storage.updateCourseProgress(userId, topicId, updates);
      res.json(progress);
    } catch (error) {
      console.error('Failed to update progress:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });

  // Quiz attempts
  app.post('/api/quiz-attempts', async (req, res) => {
    try {
      const attemptData = insertQuizAttemptSchema.parse(req.body);
      const attempt = await storage.saveQuizAttempt(attemptData);
      res.status(201).json(attempt);
    } catch (error) {
      console.error('Failed to save quiz attempt:', error);
      res.status(500).json({ error: 'Failed to save quiz attempt' });
    }
  });

  app.get('/api/quiz-attempts/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const topicId = req.query.topicId as string;
      const attempts = await storage.getQuizAttempts(userId, topicId);
      res.json(attempts);
    } catch (error) {
      console.error('Failed to fetch quiz attempts:', error);
      res.status(500).json({ error: 'Failed to fetch quiz attempts' });
    }
  });

  // Achievements
  app.get('/api/achievements/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const achievements = await storage.getUserAchievements(userId);
      res.json(achievements);
    } catch (error) {
      console.error('Failed to fetch achievements:', error);
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  });

  app.put('/api/achievements/:userId/:achievementType/unlock', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const achievementType = req.params.achievementType;
      const achievement = await storage.unlockAchievement(userId, achievementType);
      res.json(achievement);
    } catch (error) {
      console.error('Failed to unlock achievement:', error);
      res.status(500).json({ error: 'Failed to unlock achievement' });
    }
  });

  // Practice questions
  app.get('/api/practice-questions/:topicId', async (req, res) => {
    try {
      const topicId = req.params.topicId;
      const difficulty = req.query.difficulty ? parseInt(req.query.difficulty as string) : undefined;
      const questions = await storage.getPracticeQuestions(topicId, difficulty);
      res.json(questions);
    } catch (error) {
      console.error('Failed to fetch practice questions:', error);
      res.status(500).json({ error: 'Failed to fetch practice questions' });
    }
  });

  // Daily activity
  app.get('/api/activity/:userId', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const activity = await storage.getDailyActivity(userId, days);
      res.json(activity);
    } catch (error) {
      console.error('Failed to fetch daily activity:', error);
      res.status(500).json({ error: 'Failed to fetch daily activity' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
