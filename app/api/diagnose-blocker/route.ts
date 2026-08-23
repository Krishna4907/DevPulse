import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { taskTitle, taskSkills, blockerDescription, blockerType } = await request.json();

    const prompt = `
      A student developer is blocked on a coding task.
      
      Task: "${taskTitle}"
      Skills involved: ${Array.isArray(taskSkills) ? taskSkills.join(', ') : 'None specified'}
      Blocker type: ${blockerType}
      What they described: "${blockerDescription}"
      
      Provide:
      1. Top 3 most likely causes (be specific and technical)
      2. A concrete fix or next step they can try right now
      3. A resource link they can check (MDN, Stack Overflow topic, official docs)
      
      Reply in this exact JSON format with no additional text:
      {
        "causes": ["cause 1", "cause 2", "cause 3"],
        "fix": "specific actionable fix",
        "resource": "https://relevant-url.com"
      }
    `;

    const apiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const diagnosis = JSON.parse(clean);
      return Response.json({ diagnosis });
    } catch {
      return Response.json({
        diagnosis: {
          causes: [
            'Environment or dependency version mismatch',
            'Configuration or permission issue in codebase',
            'Syntax or logic error in implementation'
          ],
          fix: text || 'Double-check requirements, review related documentation, and verify recent code changes.',
          resource: 'https://developer.mozilla.org',
        },
      });
    }
  } catch (err: any) {
    console.error('Error diagnosing blocker with Gemini:', err);
    return Response.json({
      diagnosis: {
        causes: [
          'Build or dependency conflict',
          'Missing environment variables or permissions',
          'Implementation mismatch with requirements'
        ],
        fix: 'Review terminal error logs and check related component code.',
        resource: 'https://stackoverflow.com',
      },
    });
  }
}
