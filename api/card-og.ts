// Edge function to generate dynamic OG meta tags for shares
// @ts-ignore - Deployed to Vercel Edge
export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Check if this is a card, profile, or collection share URL
  const cardMatch = path.match(/^\/card\/(.+)$/);
  const profileMatch = path.match(/^\/u\/(.+)$/);
  const collectionMatch = path.match(/^\/collection\/(.+)$/);
  
  if (!cardMatch && !profileMatch && !collectionMatch) {
    // Not a share URL, serve normal HTML
    return fetch(request);
  }
  
  // Check if request is from a crawler/bot
  const userAgent = request.headers.get('user-agent') || '';
  const isCrawler = /discordbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|slackbot|googlebot|bingbot/i.test(userAgent);
  
  // If not a crawler, serve the SPA directly
  if (!isCrawler) {
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
  
  const projectId = 'hobt0-31671';
  
  // Handle collection share (/collection/:id)
  if (collectionMatch) {
    const collectionId = collectionMatch[1];
    return handleCollectionShare(collectionId, projectId);
  }
  
  // Handle profile share (/u/:username)
  if (profileMatch) {
    const username = profileMatch[1];
    return handleProfileShare(username, projectId);
  }
  
  // Handle card share (/card/:id)
  const cardId = cardMatch![1];
  return handleCardShare(cardId, projectId);
}

async function handleProfileShare(username: string, projectId: string): Promise<Response> {
  try {
    // Query Firestore for profile by username
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: "profiles" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "username" },
            op: "EQUAL",
            value: { stringValue: username }
          }
        },
        limit: 1
      }
    };
    
    const response = await fetch(firestoreUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody)
    });
    
    if (!response.ok) throw new Error('Profile not found');
    
    const data = await response.json();
    const doc = data[0]?.document;
    
    if (!doc) throw new Error('Profile not found');
    
    const fields = doc.fields || {};
    
    // Check if profile is private
    if (fields.is_public?.booleanValue === false) {
      return new Response('Private profile', { status: 403 });
    }
    
    const displayName = fields.display_name?.stringValue || username;
    const bio = fields.bio?.stringValue || '';
    const avatarUrl = fields.avatar_url?.stringValue || '';
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${displayName} (@${username}) — hobt0</title>
  <meta name="description" content="${bio.slice(0, 160).replace(/"/g, '&quot;') || `Check out ${displayName}'s knowledge archive on hobt0`}" />
  <meta name="theme-color" content="#0a0a0a" />
  
  <meta property="og:title" content="${displayName} (@${username})" />
  <meta property="og:description" content="${bio.slice(0, 200).replace(/"/g, '&quot;') || `Check out ${displayName}'s knowledge archive on hobt0`}" />
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="https://hobt0.tech/u/${username}" />
  <meta property="og:image" content="${avatarUrl || `https://hobt0.tech/og-image.png`}" />
  <meta property="og:site_name" content="hobt0" />
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${displayName} (@${username})" />
  <meta name="twitter:description" content="${bio.slice(0, 200).replace(/"/g, '&quot;') || `Check out ${displayName}'s knowledge archive on hobt0`}" />
  <meta name="twitter:image" content="${avatarUrl || `https://hobt0.tech/og-image.png`}" />
</head>
<body>
  <h1>${displayName}</h1>
  <p>@${username}</p>
  ${bio ? `<p>${bio}</p>` : ''}
  <p><a href="https://hobt0.tech/u/${username}">View profile on hobt0</a></p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300',
      },
    });
    
  } catch (error) {
    return new Response('Profile not found', { status: 404 });
  }
}

async function handleCollectionShare(collectionId: string, projectId: string): Promise<Response> {
  try {
    // Fetch collection from Firestore
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/collections/${collectionId}`;
    
    const response = await fetch(firestoreUrl);
    
    if (!response.ok) throw new Error('Collection not found');
    
    const data = await response.json();
    const fields = data.fields || {};
    
    // Check if collection is private
    if (fields.is_public?.booleanValue === false) {
      return new Response('Private collection', { status: 403 });
    }
    
    const name = fields.name?.stringValue || 'Shared Collection';
    const description = fields.description?.stringValue || '';
    const cardCount = fields.card_count?.integerValue || 0;
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — hobt0 Collection</title>
  <meta name="description" content="${description.slice(0, 160).replace(/"/g, '&quot;') || `A collection of ${cardCount} saved items on hobt0`}" />
  <meta name="theme-color" content="#0a0a0a" />
  
  <meta property="og:title" content="${name} — Collection" />
  <meta property="og:description" content="${description.slice(0, 200).replace(/"/g, '&quot;') || `A collection of ${cardCount} saved items on hobt0`}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://hobt0.tech/collection/${collectionId}" />
  <meta property="og:image" content="https://hobt0.tech/og-image.png" />
  <meta property="og:site_name" content="hobt0" />
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${name} — Collection" />
  <meta name="twitter:description" content="${description.slice(0, 200).replace(/"/g, '&quot;') || `A collection of ${cardCount} saved items on hobt0`}" />
  <meta name="twitter:image" content="https://hobt0.tech/og-image.png" />
</head>
<body>
  <h1>${name}</h1>
  <p>${description || `A collection of ${cardCount} items`}</p>
  <p><a href="https://hobt0.tech/collection/${collectionId}">View collection on hobt0</a></p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300',
      },
    });
    
  } catch (error) {
    return new Response('Collection not found', { status: 404 });
  }
}

async function handleCardShare(cardId: string, projectId: string): Promise<Response> {
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/cards/${cardId}`;
    
    const response = await fetch(firestoreUrl);
    
    if (!response.ok) throw new Error('Card not found');
    
    const data = await response.json();
    const fields = data.fields || {};
    
    if (fields.is_public?.booleanValue === false) {
      return new Response('Private card', { status: 403 });
    }
    
    const title = fields.title?.stringValue || 'Shared Card';
    const summary = fields.summary_text?.stringValue || '';
    const thumbnailUrl = fields.thumbnail_url?.stringValue || '';
    
    const truncateAtWord = (text: string, maxLength: number): string => {
      if (text.length <= maxLength) return text;
      const truncated = text.slice(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');
      return lastSpace > 0 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
    };
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — hobt0</title>
  <meta name="description" content="${truncateAtWord(summary, 160).replace(/"/g, '&quot;')}" />
  <meta name="theme-color" content="#0a0a0a" />
  
  <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta property="og:description" content="${truncateAtWord(summary, 200).replace(/"/g, '&quot;')}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://hobt0.tech/card/${cardId}" />
  <meta property="og:image" content="${thumbnailUrl || `https://hobt0.tech/og-image.png`}" />
  <meta property="og:site_name" content="hobt0" />
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta name="twitter:description" content="${truncateAtWord(summary, 200).replace(/"/g, '&quot;')}" />
  <meta name="twitter:image" content="${thumbnailUrl || `https://hobt0.tech/og-image.png`}" />
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
    return new Response('Card not found', { status: 404 });
  }
}

export const config = {
  runtime: 'edge',
};
