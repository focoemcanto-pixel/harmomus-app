export type MinistryRole = "owner" | "admin" | "manager" | "member";
export type MinistryMemberStatus = "invited" | "pending" | "active" | "removed";

export type MinistryMemberRow = {
  id: string;
  ministry_id?: string | null;
  user_id?: string | null;
  invited_email?: string | null;
  invited_name?: string | null;
  role?: MinistryRole | string | null;
  status?: MinistryMemberStatus | string | null;
  vocal_primary?: string | null;
  vocal_secondary?: string | null;
  invite_token?: string | null;
  invited_at?: string | null;
  accepted_at?: string | null;
  removed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  profile?: {
    full_name?: string | null;
    email?: string | null;
    last_login_at?: string | null;
    last_seen_at?: string | null;
  } | null;
};
