import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const bootstrapCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (authError || !authUser.user) throw new Error(authError?.message ?? "User not found");

    const user = authUser.user;
    const email = user.email ?? null;
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      email?.split("@")[0] ??
      "User";
    const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ user_id: context.userId, email, display_name: displayName, avatar_url: avatarUrl }, { onConflict: "user_id" });
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("usage_counters").upsert({ user_id: context.userId }, { onConflict: "user_id" });

    const { data: existingUserRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "user")
      .maybeSingle();
    if (!existingUserRole) {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "user" });
      if (error) throw new Error(error.message);
    }

    const { count: adminCount, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) throw new Error(countError.message);

    if ((adminCount ?? 0) === 0) {
      const { data: existingAdminRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!existingAdminRole) {
        const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
        if (error) throw new Error(error.message);
      }
    }

    const [{ data: profile }, { data: roles, error: rolesError }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("user_id,display_name,avatar_url,plan,is_banned")
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    if (rolesError) throw new Error(rolesError.message);

    return {
      profile,
      isAdmin: !!roles?.some((r) => r.role === "admin"),
    };
  });