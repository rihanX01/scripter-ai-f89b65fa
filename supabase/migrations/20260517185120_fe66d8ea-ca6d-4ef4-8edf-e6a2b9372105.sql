-- Wire handle_new_user trigger so signups create profiles, usage_counters, and default roles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any existing auth user missing one
INSERT INTO public.profiles (user_id, email, display_name, avatar_url)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- Backfill usage_counters
INSERT INTO public.usage_counters (user_id)
SELECT u.id FROM auth.users u
LEFT JOIN public.usage_counters c ON c.user_id = u.id
WHERE c.user_id IS NULL;

-- Backfill default "user" role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::app_role FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'user'
WHERE r.user_id IS NULL;