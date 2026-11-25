-- =============================================================================
-- Migration 005: Add username support to profiles for Username/Email login
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'username', ''))), ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(
      CASE
        WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'teacher', 'student')
        THEN NEW.raw_user_meta_data->>'role'
        ELSE 'student'
      END,
      'student'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
