
CREATE TABLE public.cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  ai_summary JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  read_time INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cards are publicly readable" ON public.cards
  FOR SELECT USING (true);
