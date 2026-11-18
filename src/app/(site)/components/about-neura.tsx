import TextRevealByWord from "@/components/ui/text-reveal";

const aboutNeura = `
    Neura Query began as a **collaborative editor** for researchers: papers, notes and drafts in one workspace, with live collaboration and **Zotero** import.
    \n\n
    It is now a **research system**. Every paper your team adds becomes part of one **knowledge graph** on **FalkorDB** holding metadata, citations, authors, concepts and the full text, passage by passage, with page numbers.
    \n\n
    Small agents act on that graph while you write, and **Adam** reads the field for you, builds a graph of known steps, and designs the **experiment** that would test your hypothesis.
    \n\n
    Agents only propose. Every claim carries the **page it came from** and you make the decisions.
`;

export default function AboutNeura() {
  return (
    <div className=" w-full flex flex-col items-center justify-center">
      <TextRevealByWord text={aboutNeura} />
    </div>
  );
}
