import TextRevealByWord from "@/components/ui/text-reveal";

const aboutNeura = `**Neura Query** eliminates the countless hurdles researchers face, bringing everything from paper organization to live collaboration into a single, intuitive workspace.
\n\n
With powerful **AI** to expand your ideas, seamless **Zotero** integration, and citation support via **OpenAlex**, we make research simpler, smarter, and more connected. Avoid the torments of scattered tools—Neura Query is your **all-in-one** solution to focus on discovery, not distractions.`;

const aboutNeura2 = `
    NeuraQuery simplifies mundane tasks by bringing **intelligent assistants** to your workspace. Effortlessly organize your papers, literature reviews, and notes in a system designed to work for you.
    \n\n
    Powered by Neura AI, our assistant helps expand your ideas, interact with your documents, and improve your writing. Seamless **Zotero** integration lets you import your folders directly, while advanced citation support delivers relevant papers in your field.
    \n\n
    With **live collaboration**, NeuraQuery enables writing, reviewing, and contributing, boosting your research output exponentially without added effort.
    \n\n
    Let NeuraQuery be your **personal research assistant** —simplifying, enhancing, and connecting your work so you can focus on discovery, not distraction



`
export default function AboutNeura() {
  return (
    <div className=" w-full flex flex-col items-center justify-center">
      <TextRevealByWord text={aboutNeura2} />
    </div>
  );
}
