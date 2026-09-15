export default async (request, context) => {
  const url = new URL(request.url);

  // Only touch the bare root path
  if (url.pathname === '/' && !url.searchParams.has('shop')) {
    return context.rewrite('/partners/index.html');
  }

  return context.next();
};

export const config = { path: '/' };
