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
  
  try {
    // Fetch card data from Firestore REST API
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'hobt0-31671';
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
    
    // Build HTML with dynamic meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — hobt0</title>
  <meta name="description" content="${summary.slice(0, 160).replace(/"/g, '&quot;')}" />
  <meta name="theme-color" content="#0a0a0a" />
  
  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🧠%3C/text%3E%3C/svg%3E" />
  
  <!-- Open Graph -->
  <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta property="og:description" content="${summary.slice(0, 200).replace(/"/g, '&quot;')}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://hobt0.tech/card/${cardId}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:site_name" content="hobt0" />
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta name="twitter:description" content="${summary.slice(0, 200).replace(/"/g, '&quot;')}" />
  <meta name="twitter:image" content="${ogImage}" />
  
  <!-- Redirect to actual app -->
  <meta http-equiv="refresh" content="0;url=/card/${cardId}" />
</head>
<body>
  <p>Redirecting to ${title}...</p>
  <script>
    window.location.href = '/card/${cardId}';
  </script>
</body>
</html>`;
    
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    
    // Return generic card not found HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Card Not Found — hobt0</title>
  <meta property="og:title" content="Card Not Found — hobt0" />
  <meta property="og:description" content="This card doesn't exist or may have been deleted." />
  <meta http-equiv="refresh" content="0;url=/" />
</head>
<body>
  <p>Card not found. Redirecting...</p>
  <script>window.location.href = '/';</script>
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
