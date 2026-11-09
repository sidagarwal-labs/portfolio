import { courseworkProjects, marketCompanies, researchNotes, selectedProjects } from "../../../content/journalContent";
import { profileContent } from "../../../content/siteContent";
import { backgroundStream, roleLine } from "../viewData";

/* General background sentences, kept accurate and short. Everything else is public portfolio copy imported from the site content. */
const explainers = [
  "Search matches a query to relevant documents. Retrieval selects candidates and ranking orders the results.",
  "BM25 scores documents by matching query terms. Embeddings place similar text near each other so semantic search can find related passages.",
  "Reranking reorders a short list of retrieved candidates with a stronger model. Metrics such as nDCG reward relevant results near the top.",
  "Retrieval augmented generation grounds an answer in retrieved documents. Citations let readers check the answer against its sources.",
  "A neural language model predicts a distribution over the next token using earlier tokens as context.",
  "Attention gives context tokens different weights. A causal mask prevents a token from attending to later tokens.",
  "Each attention head projects tokens into queries, keys, and values. Query and key dot products decide how much each value contributes.",
  "A transformer block mixes tokens with self attention and then transforms each position with a feed forward network. Residual connections add each layer's output back to its input.",
  "Softmax converts scores into probabilities. Temperature changes how concentrated those probabilities are.",
  "Training changes model weights to reduce prediction error. Cross entropy measures next token prediction loss.",
  "Backpropagation applies the chain rule to compute the gradient of the loss for every weight. Adam scales each update using running averages of gradients.",
  "A validation set holds out documents from training. Lower training loss does not guarantee lower validation loss.",
  "Overfitting happens when a model memorizes training examples instead of learning patterns that hold on new data. Weight decay and early stopping can reduce it.",
  "A small educational model is not a conversational assistant. A tiny corpus cannot teach broad language understanding.",
  "The portfolio contains projects, writing, background, books, and contact links. The resume describes work and education.",
  "The website has a browser desktop, a taskbar, and games. Each app opens in a window that can be minimized and restored."
];

/* One string per document; the model holds out every fifth document. Projects already listed in selectedProjects are not repeated. */
export const modelCorpus = [
  `${roleLine}. Search and retrieval help people find relevant information.`,
  profileContent.title,
  profileContent.heroSummary,
  profileContent.heroBullets.join(" "),
  ...profileContent.experience.map((entry) => `${entry.role}, ${entry.company}. ${entry.problemSpace} ${entry.scope} ${entry.impact}`),
  ...selectedProjects.map((project) => `${project.title}. ${project.description}`),
  ...profileContent.projects
    .filter((project) => !selectedProjects.some((selected) => selected.href === project.href))
    .map((project) => `${project.title}. ${project.description} ${project.thesis}`),
  ...courseworkProjects.map((project) => `${project.title}: ${project.note}.`),
  backgroundStream.map((item) => `${item.label}: ${item.detail}.`).join(" "),
  ...profileContent.books.map((book) => `${book.title} by ${book.author}. ${book.note}`),
  `Research notes: ${researchNotes.map((note) => note.title).join(", ")}.`,
  ...Object.entries(marketCompanies).map(([symbol, company]) => `${company.name} (${symbol}): ${company.about}`),
  ...explainers
];
