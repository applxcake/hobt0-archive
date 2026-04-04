// Edge function to generate dynamic OG meta tags for card shares
// @ts-ignore - Deployed to Vercel Edge
export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Check if this is a card share URL
  const cardMatch = path.match(/^\/card\/(.+)$/);
  
  if (!cardMatch) {
    // Not a card URL, serve normal HTML
    return fetch(request);
  }
  
  const cardId = cardMatch[1];
  
  // Check if request is from a crawler/bot
  const userAgent = request.headers.get('user-agent') || '';
  const isCrawler = /discordbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|slackbot|googlebot|bingbot/i.test(userAgent);
  
  // If not a crawler, serve the SPA directly (pass through to index.html)
  if (!isCrawler) {
    // Just serve index.html and let React Router handle the route
    const indexUrl = new URL('/index.html', url.origin);
    const indexResponse = await fetch(indexUrl);
    
    if (!indexResponse.ok) {
      return new Response('Failed to load app', { status: 500 });
    }
    
    const indexHtml = await indexResponse.text();
    return new Response(indexHtml, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  }
  
  // For crawlers: serve HTML with OG meta tags
  try {
    // Fetch card data from Firestore REST API
    const projectId = 'hobt0-31671';
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/cards/${cardId}`;
    
    const response = await fetch(firestoreUrl);
    
    if (!response.ok) {
      throw new Error('Card not found');
    }
    
    const data = await response.json();
    const fields = data.fields || {};
    
    // Check if card is public
    const isPublic = fields.is_public?.booleanValue || false;
    if (!isPublic) {
      return new Response('Card is private', { status: 403 });
    }
    
    // Extract card data
    const title = fields.title?.stringValue || 'Shared Card';
    const summary = fields.summary_text?.stringValue || '';
    const cardUrl = fields.url?.stringValue || '';
    const embedType = fields.embed_type?.stringValue || '';
    const thumbnailUrl = fields.thumbnail_url?.stringValue || '';
    
    // Generate OG image URL (use thumbnail if available)
    const ogImage = thumbnailUrl || `https://hobt0.tech/og-image.png`;
    
    // Helper to truncate text at word boundary with ellipsis
    const truncateAtWord = (text: string, maxLength: number): string => {
      if (text.length <= maxLength) return text;
      const truncated = text.slice(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 0) {
        return truncated.slice(0, lastSpace) + '...';
      }
      return truncated + '...';
    };
    
    // Build simple HTML with OG meta tags (for crawlers only)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — hobt0</title>
  <meta name="description" content="${truncateAtWord(summary, 160).replace(/"/g, '&quot;')}" />
  <meta name="theme-color" content="#0a0a0a" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🧠%3C/text%3E%3C/svg%3E" />
  
  <!-- Open Graph -->
  <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta property="og:description" content="${truncateAtWord(summary, 200).replace(/"/g, '&quot;')}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://hobt0.tech/card/${cardId}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:site_name" content="hobt0" />
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta name="twitter:description" content="${truncateAtWord(summary, 200).replace(/"/g, '&quot;')}" />
  <meta name="twitter:image" content="${ogImage}" />
</head>
<body>
  <h1>${title}</h1>
  <p>${truncateAtWord(summary, 300)}</p>
  <p><a href="https://hobt0.tech/card/${cardId}">View on hobt0</a></p>
</body>
</html>`;
    
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300',
      },
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    
    // Return styled card not found HTML matching app UI
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Card Not Found — hobt0</title>
  <meta name="description" content="This card doesn't exist or may have been deleted." />
  <meta name="theme-color" content="#0a0a0a" />
  <meta property="og:title" content="Card Not Found — hobt0" />
  <meta property="og:description" content="This card doesn't exist or may have been deleted." />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🧠%3C/text%3E%3C/svg%3E" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', 'SF Mono', Monaco, monospace;
      background: hsl(240 15% 4%);
      color: hsl(160 30% 85%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-image: 
        linear-gradient(hsl(160 20% 15% / 0.3) 1px, transparent 1px),
        linear-gradient(90deg, hsl(160 20% 15% / 0.3) 1px, transparent 1px);
      background-size: 40px 40px;
    }
    .container {
      text-align: center;
      max-width: 400px;
      padding: 2rem;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      border-radius: 4px;
      background: hsl(240 10% 12%);
      border: 1px solid hsl(160 20% 15%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      letter-spacing: -0.02em;
    }
    p {
      font-size: 0.875rem;
      color: hsl(240 5% 45%);
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      background: transparent;
      color: hsl(160 30% 85%);
      border: 1px solid hsl(160 20% 15%);
      border-radius: 4px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn:hover {
      border-color: hsl(160 100% 40%);
      color: hsl(160 100% 40%);
    }
    .footer {
      position: fixed;
      bottom: 1.5rem;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 0.625rem;
      color: hsl(240 5% 45% / 0.6);
      text-transform: uppercase;
      letter-spacing: 0.2em;
    }
  </style>
  <meta http-equiv="refresh" content="2;url=/" />
</head>
<body>
  <div id="root"></div>
  <div class="container">
    <div class="icon">🗄️</div>
    <h1>Card Not Found</h1>
    <p>This card doesn't exist or may have been deleted.</p>
    <a href="/" class="btn">← Go Home</a>
  </div>
  <div class="footer">hobt0.tech · cyber archive</div>
  <script>setTimeout(() => window.location.href = '/', 2000);</script>
</body>
</html>`;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
      status: 404,
    });
  }
}

export const config = {
  runtime: 'edge',
};
