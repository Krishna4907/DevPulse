export async function GET() {
  return Response.json({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 10),
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    hasNewlineInApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.includes('\n'),
    hasNewlineInAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.includes('\n'),
    hasNewlineInProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.includes('\n'),
    authDomainLength: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.length,
    projectIdLength: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.length,
  });
}
