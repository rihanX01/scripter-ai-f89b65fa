CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Allow service-role / server-side admin operations (no auth.uid()) to pass through.
  if auth.uid() is null then
    return new;
  end if;
  if not public.has_role(auth.uid(), 'admin') then
    new.plan := old.plan;
    new.is_banned := old.is_banned;
  end if;
  return new;
end;
$function$;