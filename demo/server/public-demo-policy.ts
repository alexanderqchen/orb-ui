/** Hosted demos never proxy provider traffic or accept provider secret keys.
 * Live testing belongs in a developer-owned backend or the local development harness. */
export function unavailableProviderProxy(request: Request) {
  return Response.json(
    {
      error:
        'Hosted provider calls are disabled. Use the local simulated demos or your own authenticated backend.',
    },
    { status: request.method === 'POST' ? 403 : 405, headers: { 'Cache-Control': 'no-store' } },
  )
}
