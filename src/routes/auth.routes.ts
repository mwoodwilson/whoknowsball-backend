import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Helper function to get Supabase client (lazy initialization)
const getSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
};

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['email', 'password', 'username']
      });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      return res.status(400).json({ error: 'User creation failed' });
    }

    // Create user profile
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        username
      }])
      .select()
      .single();

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    res.status(201).json({
      success: true,
      user: {
        id: userData.id,
        email: authData.user.email,
        username: userData.username
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['email', 'password']
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    res.json({
      success: true,
      session: data.session,
      user: data.user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        ...profile
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
