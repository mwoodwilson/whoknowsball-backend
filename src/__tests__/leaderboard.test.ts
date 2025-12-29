/**
 * Unit tests for the Global Leaderboard endpoint
 * Tests: /api/v1/leaderboard/global
 */

import { Request, Response } from 'express';

// Mock Redis before importing the router
jest.mock('../../config/redis', () => ({
  getCache: jest.fn(),
  setWithExpiry: jest.fn(),
}));

// Mock Supabase
const mockSupabaseSelect = jest.fn();
const mockSupabaseFrom = jest.fn(() => ({
  select: mockSupabaseSelect,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

// Import after mocks are set up
import { getCache, setWithExpiry } from '../../config/redis';

describe('GET /api/v1/leaderboard/global', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnThis();

    mockRequest = {
      query: {},
    };

    mockResponse = {
      json: responseJson,
      status: responseStatus,
    };

    // Default: no cache hit
    (getCache as jest.Mock).mockResolvedValue(null);
    (setWithExpiry as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Pagination', () => {
    it('should use default limit of 100 and offset of 0', async () => {
      // Setup mock chain
      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      // Import handler dynamically to use mocks
      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;

      // Get the global route handler
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(mockQuery.range).toHaveBeenCalledWith(0, 99); // limit 100, offset 0
      }
    });

    it('should respect custom limit and offset parameters', async () => {
      mockRequest.query = { limit: '50', offset: '25' };

      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(mockQuery.range).toHaveBeenCalledWith(25, 74); // offset 25, limit 50
      }
    });

    it('should cap limit at 500', async () => {
      mockRequest.query = { limit: '1000' };

      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(mockQuery.range).toHaveBeenCalledWith(0, 499); // capped at 500
      }
    });
  });

  describe('Response format', () => {
    it('should return correct response structure with leaderboard entries', async () => {
      const mockUsers = [
        { username: 'TopUser', overall_bks: 85.5, total_bets: 100 },
        { username: 'SecondUser', overall_bks: 75.2, total_bets: 50 },
      ];

      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: mockUsers, error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 2, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(responseJson).toHaveBeenCalledWith(
          expect.objectContaining({
            leaderboard: [
              { rank: 1, username: 'TopUser', overall_bks: 85.5, total_bets: 100 },
              { rank: 2, username: 'SecondUser', overall_bks: 75.2, total_bets: 50 },
            ],
            total: 2,
            limit: 100,
            offset: 0,
            cache_hit: false,
          })
        );
      }
    });

    it('should include updated_at timestamp in response', async () => {
      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(responseJson).toHaveBeenCalledWith(
          expect.objectContaining({
            updated_at: expect.any(String),
          })
        );
      }
    });
  });

  describe('Caching', () => {
    it('should return cached data when available', async () => {
      const cachedData = {
        leaderboard: [{ rank: 1, username: 'CachedUser', overall_bks: 90.0, total_bets: 200 }],
        total: 1,
        limit: 100,
        offset: 0,
        updated_at: '2025-12-29T00:00:00.000Z',
        cache_hit: false,
      };

      (getCache as jest.Mock).mockResolvedValue(cachedData);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(responseJson).toHaveBeenCalledWith(
          expect.objectContaining({
            ...cachedData,
            cache_hit: true,
          })
        );
        // Should not call database
        expect(mockSupabaseFrom).not.toHaveBeenCalled();
      }
    });

    it('should cache response for 5 minutes (300 seconds)', async () => {
      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(setWithExpiry).toHaveBeenCalledWith(
          expect.stringContaining('leaderboard:global'),
          expect.any(Object),
          300 // 5 minutes in seconds
        );
      }
    });
  });

  describe('Error handling', () => {
    it('should return 500 on database error', async () => {
      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValue({ count: null, error: new Error('Database error') }),
      };

      mockSupabaseSelect.mockReturnValue(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        expect(responseStatus).toHaveBeenCalledWith(500);
        expect(responseJson).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Failed to fetch global leaderboard',
          })
        );
      }
    });

    it('should continue to database on cache failure', async () => {
      (getCache as jest.Mock).mockRejectedValue(new Error('Redis unavailable'));

      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        // Should still return successful response from database
        expect(responseJson).toHaveBeenCalledWith(
          expect.objectContaining({
            leaderboard: [],
            cache_hit: false,
          })
        );
      }
    });
  });

  describe('Filtering', () => {
    it('should only include users with at least 1 bet', async () => {
      const mockQuery = {
        is: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      mockSupabaseSelect.mockReturnValueOnce({
        ...mockQuery,
        gte: jest.fn().mockResolvedValue({ count: 0, error: null }),
      });
      mockSupabaseSelect.mockReturnValueOnce(mockQuery);

      const leaderboardRouter = require('../api/routes/leaderboard.routes').default;
      const globalHandler = leaderboardRouter.stack.find(
        (layer: any) => layer.route?.path === '/global'
      )?.route?.stack[0]?.handle;

      if (globalHandler) {
        await globalHandler(mockRequest as Request, mockResponse as Response);

        // Check that gte(total_bets, 1) was called
        expect(mockQuery.gte).toHaveBeenCalledWith('total_bets', 1);
      }
    });
  });
});
