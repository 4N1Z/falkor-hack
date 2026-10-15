type Params = {
  collectionKey: string;
};
export async function GET(req: Request, params: { params: Promise<Params> }) {
  const url = new URL(req.url);
  const { collectionKey } = (await params.params);
  return new Response(
    `Zotero collection route hit with collectionKey: ${collectionKey}`
  );
}
