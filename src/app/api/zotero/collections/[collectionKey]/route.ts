type Params = {
  collectionKey: string;
};
export async function GET(req: Request, params: { params: Params }) {
  const url = new URL(req.url);
  const { collectionKey } = params.params;
  return new Response(
    `Zotero collection route hit with collectionKey: ${collectionKey}`
  );
}
