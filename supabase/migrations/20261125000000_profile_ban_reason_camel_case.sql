-- profile's columns are camelCase like the rest of the app's tables
-- ("createdAt"), so ban_reason becomes "banReason". Its length check
-- follows the column.
ALTER TABLE public.profile RENAME COLUMN ban_reason TO "banReason";
