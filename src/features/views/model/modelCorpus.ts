import { selectedProjects } from "../../../content/journalContent";

export const modelCorpus = [
  "Senior Product Manager AI search & retrieval at Microsoft. Search and retrieval help people find relevant information.",
  "The portfolio contains projects writing background books and contact links. The resume describes work and education.",
  "Attention gives context tokens different weights. A causal mask prevents a token from attending to later tokens.",
  "Training changes model weights to reduce prediction error. Cross entropy measures next token prediction loss.",
  "A validation set holds out documents from training. Lower training loss does not guarantee lower validation loss.",
  ...selectedProjects.map((project) => `${project.title}. ${project.description}`),
  "Search matches a query to relevant documents. Retrieval selects candidates and ranking orders the results.",
  "A neural language model predicts a distribution over the next token using earlier tokens as context.",
  "Softmax converts scores into probabilities. Temperature changes how concentrated those probabilities are.",
  "Books add context and ideas. Projects turn ideas into working software. Writing explains what was learned.",
  "The website has a browser desktop taskbar and games. Each app opens in a window that can be minimized and restored.",
  "A small educational model is not a conversational assistant. A tiny corpus cannot teach broad language understanding."
];
