## Phase 1: Database Schema Changes
- Add `profiles` table (user_id, username, display_name, avatar_url, bio)
- Add columns to `cards`: `user_id`, `is_public`, `thumbnail_url`, `embed_code`, `embed_type`
- Update RLS policies for multi-user access
- Create trigger for auto-creating profile on signup

## Phase 2: Authentication
- Configure auth with Email + Google sign-in
- Create `/login` page with email/password + Google OAuth
- Create auth context/provider component
- Protect dashboard routes

## Phase 3: User Profiles & Settings
- Create `/settings` page (profile picture, bio, username)
- Create public profile page at `/u/:username`
- Add "Share Archive" button that copies public URL

## Phase 4: Upgrade Save Edge Function
- Integrate Firecrawl for better URL fetching
- Extract embeds (iframe, video, social media tags)
- AI logic: detect YouTube/tweet content and adjust summary
- Store `thumbnail_url` and `embed_code` in database

## Phase 5: Redesign Bookmark Cards
- YouTube links → embedded player on card
- Image URLs → full-width preview
- Privacy toggle (lock icon) on each card
- Quick Actions menu: Edit Summary, Change Privacy, Delete, Share

## Phase 6: Dashboard Updates
- Filter cards by user_id (authenticated user)
- Public profile shows only `is_public = true` cards
