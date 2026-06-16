import resumeHref from "../../Siddhant_Agarwal_Resume (7).pdf?url";
import type {
  BookEntry,
  ExperienceEntry,
  NavLinkItem,
  ProfileContent,
  ProjectEntry,
  SceneSection,
  WritingEntry
} from "../types/content";

const navLinks: NavLinkItem[] = [
  { id: "home", label: "Home", href: "/#intro", sectionId: "intro" },
  { id: "experience", label: "Experience", href: "/#impact", sectionId: "impact" },
  { id: "projects", label: "Projects", href: "/#lab", sectionId: "lab" },
  { id: "books", label: "Books", href: "/#library", sectionId: "library" },
  { id: "contact", label: "Contact", href: "/#contact", sectionId: "contact" }
];

const sceneSections: SceneSection[] = [
  {
    id: "intro",
    label: "Earth — Ground Zero",
    eyebrow: "HOME BASE",
    title: "Technical PM at the guidance layer of AI products",
    summary:
      "I work at the boundary where product strategy, ranking systems, evaluation loops, and model behavior have to line up in production.",
    bullets: [
      "Primary orbit: Microsoft Search Relevance, M365 Chat, and Copilot-grounded retrieval.",
      "Operating style: define the metric, understand the stack, close the loop with engineering and data science.",
      "Secondary orbit: notebook-heavy public repos that make the technical range visible fast."
    ],
    tags: ["Guidance layer", "RAG systems", "Technical fluency"],
    route: "/#intro",
    position: [0, 0, -4],
    cameraPosition: [0, 6, 14],
    accent: "#00d4ff"
  },
  {
    id: "impact",
    label: "Moon — Experience",
    eyebrow: "LUNAR SURFACE",
    title: "Microsoft, Amazon, and FIRST Robotics — building systems that work",
    summary:
      "The main throughline is improving whether Copilot and enterprise search systems retrieve the right thing, explain it clearly, and stay measurable when new sources arrive.",
    bullets: [
      "Worked across indexing, embeddings, matching, lexical + semantic ranking, and summarization surfaces.",
      "Led quality and evaluation design for personalization and extensibility in M365 Chat.",
      "Amazon internship added operational safety, alerting, and workflow design under logistics constraints."
    ],
    tags: ["Microsoft", "Amazon", "FIRST Robotics"],
    route: "/#impact",
    position: [30, 0, -30],
    cameraPosition: [30, 6, -16],
    accent: "#c8d6e5"
  },
  {
    id: "lab",
    label: "Mars — Projects",
    eyebrow: "RED PLANET",
    title: "Data-science labs and model workflows on the frontier",
    summary:
      "The GitHub layer now leans hardest on model workflows, notebooks, dashboards, and one systems-visualization project that make the technical depth legible fast.",
    bullets: [
      "Applied ML work shows comfort with feature engineering, imbalance handling, threshold tradeoffs, and explainability.",
      "Graduate notebook-heavy repos make it easier for hiring managers to inspect how I move from EDA to modeling to narrative.",
      "Dashboards and visualization work show that I care about decision surfaces, not just raw model output."
    ],
    tags: ["Data science", "Notebook workflows", "Interactive labs"],
    route: "/#lab",
    position: [-30, 0, -60],
    cameraPosition: [-30, 6, -46],
    accent: "#ff6b35"
  },
  {
    id: "library",
    label: "Spaceship — Books",
    eyebrow: "COMMAND BRIDGE",
    title: "Reading list from the cockpit between destinations",
    summary:
      "The quieter layer of the portfolio is still useful: frontier-tech curiosity, biographies, investing, and operator stories read between destinations.",
    bullets: [
      "The reading shelf leans toward biographies, computing, investing, macro cycles, and operator stories.",
      "Books that shaped how I think about products, systems, and ambition.",
      "Each title links to an external purchase page for easy reference."
    ],
    tags: ["Biographies", "Investing", "Computing"],
    route: "/#library",
    position: [0, 15, -90],
    cameraPosition: [0, 16, -82],
    accent: "#a855f7"
  },
  {
    id: "contact",
    label: "ISS — Contact",
    eyebrow: "EARTH ORBIT",
    title: "Dock at the station and reach out directly",
    summary:
      "Email is the fastest route. Resume, GitHub, and LinkedIn are all one click away if this mix of product judgment and technical depth is useful.",
    bullets: [
      "Email first, then resume, GitHub, and LinkedIn.",
      "Currently working at Microsoft in the Search Relevance and M365 Chat space.",
      "Open to conversations about product, AI systems, data science, and space technology."
    ],
    tags: ["Email", "Resume", "LinkedIn"],
    route: "/#contact",
    position: [0, 22, -4],
    cameraPosition: [0, 28, 14],
    accent: "#00e68a"
  }
];

const experience: ExperienceEntry[] = [
  {
    slug: "microsoft-senior-pm",
    role: "Senior PM",
    company: "Microsoft Search Relevance · M365 Chat (Copilot)",
    timeframe: "2021 – Present",
    location: "Bellevue, WA / Remote",
    problemSpace:
      "Improve grounded retrieval quality for Copilot-style experiences where the answer depends on the right enterprise context showing up quickly and defensibly.",
    scope:
      "Worked across RAG and grounding layers including indexing, embeddings, matching, ranking, and summarization; led quality and evaluation design for personalization, extensibility, and new content-source onboarding.",
    systemsThemes: ["RAG", "Grounding", "Ranking", "Evaluation", "Extensibility"],
    impact:
      "Established offline and online success criteria for hill-climbing and regression detection, helping the team make sharper launch and iteration decisions without relying on intuition alone.",
    missionReadout: [
      { label: "Bull Signal", value: "Retrieval quality", detail: "Grounding and ranking health across Copilot surfaces.", tone: "positive" },
      { label: "Vol Alert", value: "Launch regressions", detail: "Quality drops need to be measurable before they hit users.", tone: "caution" },
      { label: "Growth Trend", value: "Personalization + extensibility", detail: "New sources and user context without losing trust.", tone: "positive" }
    ]
  },
  {
    slug: "microsoft-pm-i",
    role: "PM I",
    company: "Microsoft Search Assistant and Intelligence",
    timeframe: "2021 – 2023",
    location: "Bellevue, WA / Remote",
    problemSpace:
      "Turn user-understanding signals into better enterprise search and assistant experiences, especially in email-heavy workflows where natural-language interpretation drives the experience.",
    scope:
      "Program lead for natural language understanding and processing in Outlook email scenarios; drove metric review, opportunity analysis, partner alignment, and roadmap shaping across engineering and data science collaborators.",
    systemsThemes: ["NLU", "Metrics", "Roadmapping", "Cross-functional delivery"],
    impact:
      "Managed execution across an 11-person cross-discipline group and pushed data-driven decisions on where quality gaps existed and which improvements were worth the team’s time.",
    missionReadout: [
      { label: "Bull Signal", value: "User intent parsing", detail: "Better interpretation in email-heavy assistant workflows.", tone: "positive" },
      { label: "Vol Alert", value: "Intent mismatch", detail: "Misread natural language creates downstream search quality problems.", tone: "caution" },
      { label: "Growth Trend", value: "Cross-functional delivery", detail: "Metrics and roadmap shaping across engineering and data science.", tone: "neutral" }
    ]
  },
  {
    slug: "microsoft-intern",
    role: "PM Intern",
    company: "Microsoft",
    timeframe: "Summer 2021",
    location: "Bellevue, WA / Remote",
    problemSpace:
      "Figure out where enterprise search was headed and what Microsoft needed to strengthen in natural-language search support.",
    scope:
      "Ran competitive analysis, SWOT framing, and language-support research for the enterprise search landscape, then translated that into a roadmap view for leadership.",
    systemsThemes: ["Competitive analysis", "Enterprise search", "Strategy"],
    impact:
      "Influenced UU and MSAI leadership discussions by making the market landscape and next value-added moves easier to reason about.",
    missionReadout: [
      { label: "Bull Signal", value: "Market mapping", detail: "Competitive and language-support intelligence for enterprise search.", tone: "positive" },
      { label: "Vol Alert", value: "Coverage gaps", detail: "Language and capability gaps were visible before roadmap decisions.", tone: "caution" },
      { label: "Growth Trend", value: "Leadership influence", detail: "Research translated into a clearer roadmap view.", tone: "neutral" }
    ]
  },
  {
    slug: "amazon-intern",
    role: "PM Intern",
    company: "Amazon Middle Mile",
    timeframe: "Summer 2021",
    location: "Nashville, TN / Remote",
    problemSpace:
      "Reduce weather-driven logistics risk without slowing the network or overloading drivers and carriers with noisy alerts.",
    scope:
      "Proposed a severe-weather alert experience, analyzed yearly safety data, mapped decision scenarios, and created SOPs plus a mitigation matrix for driver and carrier workflows.",
    systemsThemes: ["Logistics UX", "Safety systems", "Analytics", "Operations"],
    impact:
      "Framed a path to cut weather-related incidents by 20% annually while linking safety intervention design to delivery efficiency rather than treating them as separate problems.",
    missionReadout: [
      { label: "Bull Signal", value: "Weather alerts", detail: "Operational safety signals surfaced at the right decision points.", tone: "positive" },
      { label: "Vol Alert", value: "Safety vs throughput", detail: "The system had to reduce incidents without slowing the network blindly.", tone: "caution" },
      { label: "Growth Trend", value: "Mitigation path", detail: "SOPs and scenario mapping tied risk response to delivery flow.", tone: "neutral" }
    ]
  },
  {
    slug: "community-leadership",
    role: "Community Builder",
    company: "UNCC + First Robotics + Winterville Youth Council",
    timeframe: "2014 – 2020",
    location: "North Carolina",
    problemSpace:
      "Build teams, mobilize people, and move ambiguous initiatives from idea to execution without formal authority.",
    scope:
      "Co-founded Hult Prize and Consult-your-Community chapters at UNCC, captained and mentored a successful FIRST Robotics team, and helped pass a sidewalk safety ordinance through local youth council work.",
    systemsThemes: ["Leadership", "Community organizing", "Execution under ambiguity"],
    impact:
      "These roles are the early proof that I like owning the whole path: framing the problem, getting people aligned, and translating intent into something operational.",
    missionReadout: [
      { label: "Bull Signal", value: "Leadership under ambiguity", detail: "Early evidence that I like end-to-end ownership.", tone: "positive" },
      { label: "Vol Alert", value: "No formal authority", detail: "Alignment had to happen through influence and execution.", tone: "caution" },
      { label: "Growth Trend", value: "Chapters, teams, policy", detail: "Initiatives moved from idea to tangible outcomes.", tone: "neutral" }
    ]
  }
];

const projects: ProjectEntry[] = [
  {
    slug: "ai-llm-stack-tracker",
    title: "AI / LLM Stack Tracker",
    category: "Live market tracker",
    focusArea: "Analytics",
    archetype: "console-analytics",
    thesis:
      "The AI buildout is easiest to reason about as a vertical stack: every layer from chip design up to the application surface has its own winners, bottlenecks, and capital cycle.",
    description:
      "A live tracker that maps the public companies powering the AI / LLM buildout across the full supply chain - chip design and fabrication, data-center power, cooling and networking, storage and cloud infrastructure, and the application layer - with valuation and momentum signals for every name.",
    missionReadout: [
      { label: "Bull Signal", value: "Full-stack coverage", detail: "50+ names from silicon design through power, networking, cloud, and the apps users touch.", tone: "positive" },
      { label: "Growth Trend", value: "Capex-to-revenue lens", detail: "Tracks where AI spend lands first and which layers convert it into earnings.", tone: "neutral" },
      { label: "Vol Alert", value: "Valuation dispersion", detail: "P/E ranges from the low 20s to 400x+, so momentum and 52-week distance matter as much as multiple.", tone: "caution" }
    ],
    stack: ["Google Sheets", "GOOGLEFINANCE", "Live market data", "Equity screening"],
    comparisonChips: ["Chips", "Data center", "Data", "Application", "Memory / HBM", "Networking", "Power", "Foundry"],
    artifacts: ["50+ tracked tickers", "4 stack layers", "17 functional levels"],
    evidence: [
      {
        label: "Coverage",
        value: "50+ public names spanning chip design and fab tooling through power, networking, storage, cloud, and the application layer."
      },
      {
        label: "Signal columns",
        value: "Price, market cap, daily move, EPS, P/E, beta, and distance from 52-week highs and lows for every name."
      },
      {
        label: "Why it matters",
        value: "Turns the abstract 'AI trade' into a structured map of where the capital, bottlenecks, and pricing power actually sit."
      }
    ],
    previewCards: [
      {
        title: "Chips",
        subtitle: "Levels 1-6",
        note: "Design (NVDA, GOOGL, AMD), custom silicon (AVGO, ARM, MRVL), fab tooling (ASML, LRCX, AMAT), memory / HBM (MU), and foundry (TSM)."
      },
      {
        title: "Data center",
        subtitle: "Levels 7-13",
        note: "Power (GEV, CEG, ETN), cooling (VRT), networking (ANET, AVGO), cold storage, and servers (DELL, MSFT, AMZN, ORCL)."
      },
      {
        title: "Data + application",
        subtitle: "Levels 14-17",
        note: "Cloud and analytics (SNOW, DDOG, PLTR, MDB) up to the surfaces users touch (META, GOOGL, TSLA, MSFT)."
      }
    ],
    drawerSections: [
      {
        id: "stack",
        label: "Stack map",
        title: "From silicon to the surface in one board",
        summary: "The tracker is organized as a layered stack so each name sits where it actually adds value in the AI supply chain.",
        bullets: [
          "Chips layer: design, custom silicon, fab tooling, packaging, memory / HBM, and foundry.",
          "Data-center layer: power, cooling, networking, cold storage, cloud infrastructure, and servers.",
          "Data and application layers: storage, cloud analytics, and the consumer or enterprise surfaces on top."
        ]
      },
      {
        id: "signals",
        label: "Signal columns",
        title: "Valuation and momentum side by side",
        summary: "Each row carries the columns I actually use to judge a name instead of a single price quote.",
        bullets: [
          "Valuation: market cap, EPS, and price-to-earnings across the whole stack.",
          "Momentum: daily move plus distance from the 52-week high and low.",
          "Risk: beta, so positioning reflects how violently a name moves with the tape."
        ]
      },
      {
        id: "thesis",
        label: "Investing lens",
        title: "Where the capital cycle actually lands",
        summary: "The board is built to answer one question: as AI spend compounds, which layer captures the earnings and which is just passing the money through?",
        bullets: [
          "First-order chip names get crowded by mid-cycle, so the board keeps the later layers easy to watch.",
          "Power, cooling, and networking surface the physical bottlenecks behind the data-center buildout.",
          "The application layer is where monetization has to show up for the rest of the stack to hold."
        ]
      }
    ],
    whatThisProves:
      "I track the AI buildout the way I think about products: as a system with layers, bottlenecks, and feedback loops, not a single trade.",
    href: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiLfygL3LFE2X_ynXjE5IzIKrvVPT_AFSwuZCZn59pMUd0dsR4Tdpx-OUxaDmDiMYrioLurLWE3_CO/pubhtml",
    hrefLabel: "Open live tracker",
    accent: "#5df0be",
    visualMode: "signal"
  },
  {
    slug: "applied-machine-learning",
    title: "Applied Machine Learning",
    category: "Public GitHub project",
    focusArea: "Data science",
    archetype: "mars-lab",
    thesis:
      "Applied ML quality comes from disciplined preprocessing, class-imbalance handling, explainability, and evaluation choices, not model hype.",
    description:
      "A collection of fraud and anomaly-detection work covering supervised and unsupervised models, feature handling, SHAP-based explainability, PCA, and precision-recall oriented evaluation.",
    missionReadout: [
      { label: "Bull Signal", value: "Fraud + anomaly signatures", detail: "Feature work and preprocessing surface the right patterns before model choice.", tone: "positive" },
      { label: "Vol Alert", value: "False positives under skew", detail: "Precision-recall tradeoffs matter more than a single accuracy number.", tone: "caution" },
      { label: "Growth Trend", value: "Explainability + unsupervised lane", detail: "SHAP, PCA, Isolation Forest, and LOF widen the technical surface.", tone: "positive" }
    ],
    stack: ["Python", "LightGBM", "XGBoost", "SHAP"],
    comparisonChips: ["LightGBM", "Random Forest", "XGBoost", "Log Reg", "Isolation Forest", "Local Outlier Factor", "PCA", "SHAP"],
    artifacts: ["Fraud detection notebooks", "Anomaly experiments", "SHAP diagnostics"],
    evidence: [
      {
        label: "Notebook lane",
        value: "Preprocessing, class imbalance handling, threshold comparison, PCA, and explainability are visible in the workflow."
      },
      {
        label: "Model lane",
        value: "LightGBM, XGBoost, and anomaly methods show both supervised and unsupervised problem framing."
      },
      {
        label: "Hiring signal",
        value: "Shows that I understand how evaluation tradeoffs work in practice, especially when accuracy is the wrong headline metric."
      }
    ],
    previewCards: [
      {
        title: "Detecting-First-Payment-Default",
        subtitle: "Supervised fraud workflow",
        note: "KNN and iterative imputation, feature selection, and LightGBM/XGBoost/Random Forest/Log Reg comparison."
      },
      {
        title: "Anomaly_Fraud_Detection",
        subtitle: "Unsupervised anomaly lane",
        note: "Time-based features, PCA, Isolation Forest, and Local Outlier Factor for anomaly search."
      },
      {
        title: "EDA_Banking_Transactions_Fraud_Data",
        subtitle: "EDA and report layer",
        note: "Banking transaction patterns and fraud cues surfaced before model selection."
      }
    ],
    drawerSections: [
      {
        id: "notebook",
        label: "Notebook lane",
        title: "From raw banking data into supervised and unsupervised workflows",
        summary: "The repo reads like a compact lab notebook: EDA first, then supervised default detection, then anomaly search.",
        bullets: [
          "EDA_Banking_Transactions_Fraud_Data establishes transaction behavior and potential fraud signals before modeling.",
          "Detecting-First-Payment-Default carries the supervised workflow from preprocessing into model comparison.",
          "Anomaly_Fraud_Detection widens the problem frame with unsupervised anomaly search on the same domain."
        ]
      },
      {
        id: "model",
        label: "Model lane",
        title: "Tree ensembles, linear baselines, and anomaly detectors",
        summary: "The useful signal here is not one winning model, but the comparison discipline across multiple approaches.",
        bullets: [
          "LightGBM, Random Forest, XGBoost, and logistic regression cover the supervised lane.",
          "Isolation Forest and Local Outlier Factor test anomaly framing instead of assuming labels are enough.",
          "PCA acts as a dimensionality reduction lens before unsupervised inspection."
        ]
      },
      {
        id: "evaluation",
        label: "Evaluation lane",
        title: "Precision-recall thinking over vanity metrics",
        summary: "The strongest hiring signal is the evaluation mindset: class imbalance handling and threshold tradeoffs are treated as first-order concerns.",
        bullets: [
          "Class weights, undersampling, and SMOTE are compared rather than accepted as defaults.",
          "RandomizedSearchCV tightens the search space without pretending the model will tune itself.",
          "Precision, recall, F1, and SHAP plots make the operational tradeoffs legible."
        ]
      },
      {
        id: "business",
        label: "Business takeaway",
        title: "Risk-aware modeling for fraud and anomaly work",
        summary: "This repo matters because it shows I understand both the notebook mechanics and the risk posture behind the problem.",
        bullets: [
          "Fraud is a false-negative-sensitive domain, so evaluation choices have real operational consequences.",
          "Explainability matters when model output is going to influence intervention decisions.",
          "It makes my technical depth easier to trust in product conversations."
        ]
      }
    ],
    whatThisProves:
      "I stay credible in technical conversations because I understand how modeling workflows are actually built, compared, and interpreted.",
    href: "https://github.com/sidagarwal-labs/Applied-Machine-Learning",
    accent: "#ff8b5d",
    visualMode: "spectrum"
  },
  {
    slug: "yelp-reviews-philly",
    title: "Analyzing Yelp Reviews: Philadelphia Restaurants",
    category: "Public GitHub project",
    focusArea: "Data science",
    archetype: "mars-lab",
    thesis:
      "Unstructured review data gets more valuable when classical analysis and LLM-assisted theme extraction are combined instead of treated as separate tracks.",
    description:
      "A graduate data science project using the Yelp open dataset for filtering, EDA, time-series work, regression, topic and sentiment analysis, and pandemic shock analysis.",
    missionReadout: [
      { label: "Bull Signal", value: "Sentiment + operations features", detail: "Checkins, polarity, review length, and category data combine into one analytical frame.", tone: "positive" },
      { label: "Vol Alert", value: "Sparse noisy category space", detail: "Real-world restaurant data needs cleaning and careful feature interpretation.", tone: "caution" },
      { label: "Growth Trend", value: "Regression + LLM synthesis", detail: "Classical modeling and theme extraction reinforce each other.", tone: "positive" }
    ],
    stack: ["Python", "Jupyter", "Regression", "LLM analysis"],
    comparisonChips: ["Logistic Regression", "XGBoost Regressor", "TextBlob", "Topic extraction", "Pandemic shock analysis"],
    artifacts: ["Yelp_Regression_Philly.ipynb", "Topic and sentiment notebook", "Final presentation deck"],
    evidence: [
      {
        label: "Notebook lane",
        value: "Filtering, EDA, pandemic shock analysis, regression, topic work, and sentiment analysis all show up as part of one narrative."
      },
      {
        label: "Model lane",
        value: "Classical analysis and LLM-assisted synthesis are combined instead of presented as unrelated experiments."
      },
      {
        label: "Hiring signal",
        value: "Shows I can turn a messy real-world dataset into a clear analytical story with technical depth behind it."
      }
    ],
    previewCards: [
      {
        title: "Yelp_Regression_Philly.ipynb",
        subtitle: "Feature matrix build",
        note: "A 5,744-row modeling set combining checkins, reviews, sentiment, categories, and new-restaurant flags."
      },
      {
        title: "XGBoost_Regressor_to_predict_business_overall...",
        subtitle: "Prediction lane",
        note: "Regression work aimed at predicting overall business rating from engineered restaurant features."
      },
      {
        title: "1_Topic_phrase+sentiment+subtheme_extraction",
        subtitle: "Theme extraction lane",
        note: "LLM-assisted topic, phrase, and sentiment extraction layered on top of the structured analysis."
      }
    ],
    drawerSections: [
      {
        id: "notebook",
        label: "Notebook lane",
        title: "A graduate project that behaves like a full analytical pipeline",
        summary: "The repo moves from raw Yelp parquet files into EDA, feature engineering, regression, text analysis, and presentation.",
        bullets: [
          "Data extraction and filtering come first so the later model work is grounded in a narrower Philadelphia restaurant slice.",
          "Feature engineering combines checkins, review counts, average review length, polarity scores, and category expansions.",
          "The repo ends with deliverables that are easy to present, not just code cells left in isolation."
        ]
      },
      {
        id: "model",
        label: "Model lane",
        title: "Regression, sentiment features, and topic extraction in one repo",
        summary: "The technical range is visible because the repo is not limited to a single notebook or one modeling frame.",
        bullets: [
          "Logistic and regression-style modeling are both present depending on the target framing.",
          "TextBlob-based polarity and category-based features widen the explanatory surface.",
          "The topic and sentiment notebook adds an LLM/text-analysis lane instead of leaving the text unmodeled."
        ]
      },
      {
        id: "evaluation",
        label: "Evaluation lane",
        title: "Metrics and feature interpretation are both visible",
        summary: "This repo stands out because it shows not just model outputs, but also how the features are interpreted after training.",
        bullets: [
          "Accuracy, precision, recall, F1, and classification reporting all appear in the notebook flow.",
          "Positive and negative coefficients make the rating drivers easier to explain to a non-technical viewer.",
          "Pandemic shock analysis adds a temporal lens beyond static prediction."
        ]
      },
      {
        id: "business",
        label: "Business takeaway",
        title: "Customer text and operational signals can be merged into one decision story",
        summary: "The hiring-manager value is that the project shows both analysis depth and the ability to narrate what matters.",
        bullets: [
          "It translates noisy customer text into signals about restaurant quality and category effects.",
          "It shows an instinct to connect features, model output, and presentation narrative.",
          "That combination is useful for product work where data only matters if someone can act on it."
        ]
      }
    ],
    whatThisProves:
      "I can connect exploratory analysis, modeling, and narrative synthesis into a project that explains not just what happened but why it matters.",
    href: "https://github.com/sidagarwal-labs/Analyzing-Yelp-Reviews---Philadelphia-Restaurants",
    accent: "#ff9a74",
    visualMode: "score"
  },
  {
    slug: "intro-to-modeling",
    title: "Intro to Modeling",
    category: "Public GitHub project",
    focusArea: "Data science",
    archetype: "mars-lab",
    thesis:
      "Breadth across classical models matters because it shows I understand which tool fits which problem shape, not just one preferred workflow.",
    description:
      "A notebook collection spanning ANN, ARIMA, forecasting, decision trees, PCA, random forest, SVM, survival analysis, text work, and other modeling exercises from the data science coursework layer.",
    missionReadout: [
      { label: "Bull Signal", value: "Broad model fluency", detail: "Classification, forecasting, dimensionality reduction, survival, and text all appear in one repo.", tone: "positive" },
      { label: "Vol Alert", value: "Different assumptions per problem", detail: "Each notebook asks for a different modeling posture rather than one reusable template.", tone: "caution" },
      { label: "Growth Trend", value: "Strong fundamentals compounding", detail: "The repo reads like technical range that keeps growing.", tone: "positive" }
    ],
    stack: ["Python", "Jupyter", "Time series", "Classical ML"],
    comparisonChips: ["ANN", "ARIMA", "Decision Tree", "Random Forest", "SVM", "PCA", "Survival Models"],
    artifacts: ["ANN notebook", "ARIMA notebook", "Federalist ranking notebook"],
    evidence: [
      {
        label: "Notebook lane",
        value: "The repo clearly shows breadth: ANN, ARIMA, Amtrak forecasting, PCA, random forest, SVM, survival models, and text-heavy side notebooks."
      },
      {
        label: "Model lane",
        value: "It proves I can reason across classification, forecasting, dimensionality reduction, and text instead of staying in one narrow lane."
      },
      {
        label: "Hiring signal",
        value: "A hiring manager can quickly see that the data-science layer is real, varied, and still compounding."
      }
    ],
    previewCards: [
      {
        title: "ANN_(Neural_Network).ipynb",
        subtitle: "Neural network lane",
        note: "Intro classification work that broadens the repo beyond tree-based baselines."
      },
      {
        title: "ARIMA_model.ipynb",
        subtitle: "Forecasting lane",
        note: "Time-series foundations alongside Wine Sales and Amtrak forecasting notebooks."
      },
      {
        title: "federalist_ranking.ipynb",
        subtitle: "Text and interpretation lane",
        note: "Shows curiosity beyond textbook exercises through ranking and text-oriented work."
      }
    ],
    drawerSections: [
      {
        id: "notebook",
        label: "Notebook lane",
        title: "A modeling repository that makes breadth visible at a glance",
        summary: "This repo is useful because the notebook list itself acts like a technical map of the concepts I have worked through.",
        bullets: [
          "ANN, decision tree, random forest, and SVM cover multiple classification baselines.",
          "ARIMA, Wine Sales, and Amtrak forecasting introduce time-series reasoning.",
          "PCA, survival models, federalist ranking, and simple text mining widen the analytical surface."
        ]
      },
      {
        id: "model",
        label: "Model lane",
        title: "Different tools for different problem geometries",
        summary: "The value here is not polish on one flagship notebook, but evidence of adaptability across many modeling setups.",
        bullets: [
          "Tree models, neural nets, and SVMs highlight supervised classification variety.",
          "ARIMA and forecasting notebooks show time-series assumptions rather than static tabular thinking.",
          "PCA and survival work show comfort with reduction and event-time style analysis."
        ]
      },
      {
        id: "evaluation",
        label: "Evaluation lane",
        title: "Breadth that still points toward sound fundamentals",
        summary: "Even without one central benchmark, the repo is valuable because it demonstrates repeated exposure to model setup, assumptions, and output interpretation.",
        bullets: [
          "The notebook mix reinforces that evaluation depends on the problem class, not on a single default metric.",
          "It shows the discipline of working through multiple model families rather than copying a single recipe.",
          "That matters for roles where technical breadth supports stronger product or analytics judgment."
        ]
      },
      {
        id: "business",
        label: "Business takeaway",
        title: "Strong fundamentals make later product and data work more credible",
        summary: "This repo is less about one flashy artifact and more about making the learning curve itself legible to hiring managers.",
        bullets: [
          "It shows compounding technical fluency across many standard modeling tasks.",
          "It gives confidence that I can enter DS and ML conversations with real hands-on context.",
          "That depth improves both builder work and product decision quality."
        ]
      }
    ],
    whatThisProves:
      "I have real breadth across classical ML, time series, survival analysis, and text-oriented notebooks, not just one narrow modeling slice.",
    href: "https://github.com/sidagarwal-labs/Intro-to-Modeling",
    accent: "#ffb36b",
    visualMode: "spectrum"
  },
  {
    slug: "gdp-dashboard",
    title: "GDP Dashboard",
    category: "Public GitHub project",
    focusArea: "Analytics",
    archetype: "console-analytics",
    thesis:
      "Even a lightweight dashboard is useful only when the interface helps someone move quickly from raw data to comparison and interpretation.",
    description:
      "A Streamlit-based GDP dashboard project adapted from a template and extended into a cleaner analytical surface for comparing country-level data.",
    missionReadout: [
      { label: "Bull Signal", value: "Macro comparison at a glance", detail: "Country-level GDP views are easy to scan and compare.", tone: "positive" },
      { label: "Vol Alert", value: "Context overload", detail: "Dashboards fail when they add charts without helping interpretation.", tone: "caution" },
      { label: "Growth Trend", value: "Interactive decision surface", detail: "Streamlit and Altair keep the analysis compact and accessible.", tone: "neutral" }
    ],
    stack: ["Python", "Streamlit", "Altair", "Dashboarding"],
    comparisonChips: ["Streamlit", "Altair", "Country filters", "Comparative charts"],
    artifacts: ["Country comparison dashboard", "Interactive filters", "Altair views"],
    evidence: [
      {
        label: "Surface lens",
        value: "The project is about making economic comparisons faster to inspect rather than making the interface flashy."
      },
      {
        label: "Product lens",
        value: "Controls, chart choices, and layout all support quicker interpretation from a hiring-manager point of view."
      },
      {
        label: "Hiring signal",
        value: "Shows that I can package data work into a compact interactive surface instead of leaving it as a notebook only."
      }
    ],
    previewCards: [
      {
        title: "Country comparison dashboard",
        subtitle: "Macro console",
        note: "A clean Streamlit surface for scanning country-level GDP differences quickly."
      },
      {
        title: "Interactive filters",
        subtitle: "Decision controls",
        note: "A small set of controls improves comparison without clutter."
      },
      {
        title: "Altair views",
        subtitle: "Chart lane",
        note: "Compact visual views that move from raw data toward interpretation."
      }
    ],
    drawerSections: [
      {
        id: "dashboard",
        label: "Dashboard lane",
        title: "A compact analytics surface rather than a notebook dump",
        summary: "This project stands out because it packages data into something a visitor can understand quickly.",
        bullets: [
          "The core interaction is comparison, so the interface stays light and focused.",
          "Streamlit keeps the deployment surface simple enough to ship without overengineering.",
          "Altair is used to make the macro data legible instead of decorative."
        ]
      },
      {
        id: "model",
        label: "Interpretation lane",
        title: "Useful analytics depends on what the viewer can see quickly",
        summary: "The important thing here is not modeling complexity, but interface discipline and information hierarchy.",
        bullets: [
          "Controls and charts are organized to support fast comparative reading.",
          "The dashboard acts like a decision surface more than a toy demo.",
          "That makes it a good complement to the notebook-heavy repos."
        ]
      },
      {
        id: "evaluation",
        label: "Signal lane",
        title: "The success metric is legibility",
        summary: "For this kind of project, the evaluation question is whether the user can move from question to answer quickly.",
        bullets: [
          "Fast interpretation matters more than adding every possible macro indicator.",
          "The surface favors comparison and reading speed over visual novelty.",
          "It shows product taste on analytics tooling."
        ]
      },
      {
        id: "business",
        label: "Business takeaway",
        title: "A dashboard can be small and still feel useful",
        summary: "The hiring-manager value is that it proves I can turn analysis into a visitor-friendly surface.",
        bullets: [
          "It demonstrates shipping instinct on top of data work.",
          "It keeps the signal-to-noise ratio high.",
          "That complements both PM work and notebook-heavy projects."
        ]
      }
    ],
    whatThisProves:
      "I can ship compact analytics products that make data legible fast, without overcomplicating the interface.",
    href: "https://github.com/sidagarwal-labs/gdp-dashboard",
    accent: "#7dffb3",
    visualMode: "orbit"
  },
  {
    slug: "bowtie-diagram",
    title: "Bowtie Diagram Visualization",
    category: "Public GitHub project",
    focusArea: "Visualization",
    archetype: "network-map",
    thesis:
      "Complex risk systems become usable when structure, hierarchy, and interaction design make causal relationships easy to navigate.",
    description:
      "A React-based bowtie diagram visualization with ELK.js layout, zoom and pan, hierarchical hazard detail, and custom nodes for threats, barriers, top events, and consequences.",
    missionReadout: [
      { label: "Bull Signal", value: "Causal structure clarity", detail: "Dense risk systems become easier to inspect and navigate.", tone: "positive" },
      { label: "Vol Alert", value: "Graph density", detail: "Complex relationships can collapse into noise without layout discipline.", tone: "caution" },
      { label: "Growth Trend", value: "Interactive systems mapping", detail: "The interface turns a static diagram into a decision surface.", tone: "neutral" }
    ],
    stack: ["React", "TypeScript", "ELK.js", "React Flow"],
    comparisonChips: ["Custom nodes", "ELK layout", "Threats", "Barriers", "Consequences"],
    artifacts: ["Custom node system", "ELK graph layout", "Zoom and pan"],
    evidence: [
      {
        label: "Structure lens",
        value: "Hierarchy, layout, and node semantics make a dense causal system legible fast."
      },
      {
        label: "Interaction layer",
        value: "Zoom, pan, and detail reveal turn a static risk artifact into a navigable interface."
      },
      {
        label: "Hiring signal",
        value: "Shows builder instinct on interface systems, not just notebooks or backend logic."
      }
    ],
    previewCards: [
      {
        title: "Threat and barrier nodes",
        subtitle: "System map layer",
        note: "Custom nodes encode different roles in the risk system rather than flattening everything into one graph shape."
      },
      {
        title: "ELK graph layout",
        subtitle: "Layout engine",
        note: "Structure and spacing make the causal relationships readable under complexity."
      },
      {
        title: "Zoom and pan interaction",
        subtitle: "Exploration lane",
        note: "The diagram behaves like an interface, not a static illustration."
      }
    ],
    drawerSections: [
      {
        id: "structure",
        label: "Structure lane",
        title: "Risk architecture made explorable",
        summary: "The repo matters because it converts a dense causal framework into a surface someone can actually navigate.",
        bullets: [
          "Threats, barriers, top events, and consequences each receive custom node treatment.",
          "Layout is part of the product, not an afterthought after the data loads.",
          "That makes the structure legible even before the visitor reads the details."
        ]
      },
      {
        id: "interaction",
        label: "Interaction lane",
        title: "From static diagram to live decision surface",
        summary: "The interactive layer shows product taste as much as technical implementation.",
        bullets: [
          "Zoom and pan let the viewer move between overview and detail.",
          "Hierarchical hazard detail prevents the graph from flattening into one unreadable surface.",
          "The repo is a good counterweight to the notebook-heavy work."
        ]
      },
      {
        id: "evaluation",
        label: "Signal lane",
        title: "Legibility is the performance target",
        summary: "The success metric here is whether complex causality becomes easier to reason about.",
        bullets: [
          "Node semantics carry meaning, not just decoration.",
          "Layout decisions directly affect comprehension speed.",
          "That reflects systems thinking in interface form."
        ]
      },
      {
        id: "business",
        label: "Business takeaway",
        title: "Systems visualization can be operational, not ornamental",
        summary: "The project shows that I can make abstract systems more usable for real decision-making.",
        bullets: [
          "It proves I can package complexity into an interface people can inspect.",
          "That matters in PM and analytics contexts where structure clarity drives better decisions.",
          "It also diversifies the portfolio beyond notebook work."
        ]
      }
    ],
    whatThisProves:
      "I can take an abstract systems concept and turn it into an interactive decision surface rather than a static diagram.",
    href: "https://github.com/sidagarwal-labs/bowtie-diagram",
    accent: "#7ce0ff",
    visualMode: "grid"
  },
  {
    slug: "copilot-personalization-case-study",
    title: "Copilot Retrieval Personalization",
    category: "Microsoft case study",
    focusArea: "AI product systems",
    archetype: "mission-schematic",
    thesis:
      "Personalized retrieval only matters if the team can prove it improves grounding quality without making the system harder to debug or trust.",
    description:
      "A high-level product systems narrative around personalization for file-centric enterprise search in M365 Chat: measure the right user activity signals, define success metrics, and make iteration safe.",
    missionReadout: [
      { label: "Bull Signal", value: "User-context retrieval", detail: "Personalization only helps when the grounding quality actually improves.", tone: "positive" },
      { label: "Vol Alert", value: "Opaque behavior", detail: "More personalization can make the system harder to debug or trust.", tone: "caution" },
      { label: "Growth Trend", value: "Eval-informed iteration", detail: "Offline and online criteria make iteration safe enough to ship.", tone: "neutral" }
    ],
    stack: ["RAG", "Offline eval", "Online experimentation", "Personalization"],
    comparisonChips: ["Activity signals", "Ranking logic", "Grounding quality", "Launch criteria"],
    artifacts: ["Retrieval metric tree", "Offline eval loop", "Personalization launch criteria"],
    evidence: [
      {
        label: "System lens",
        value: "Activity signals, ranking logic, grounding quality, and trust all have to move together."
      },
      {
        label: "Evaluation lens",
        value: "Offline success criteria plus guarded online experimentation keep personalization from becoming guesswork."
      },
      {
        label: "Hiring signal",
        value: "Shows product judgment inside an AI system where metrics and model behavior are tightly coupled."
      }
    ],
    previewCards: [
      {
        title: "Retrieval metric tree",
        subtitle: "Signal map",
        note: "A way to reason about whether personalization is improving grounding or only adding complexity."
      },
      {
        title: "Offline eval loop",
        subtitle: "Experiment lane",
        note: "Evaluation work that makes hill-climbing safer before user-facing rollout."
      },
      {
        title: "Launch criteria",
        subtitle: "Decision board",
        note: "The product judgment layer that keeps iteration tied to measurable quality."
      }
    ],
    drawerSections: [
      {
        id: "signal",
        label: "Signal lane",
        title: "Personalization only matters if it improves grounded retrieval",
        summary: "The work is about aligning user activity signals with ranking behavior in a way the product can defend.",
        bullets: [
          "The signal design has to map to real user context, not just activity volume.",
          "Ranking logic and grounding quality need to move together.",
          "This is the kind of AI product work where metrics and model behavior are inseparable."
        ]
      },
      {
        id: "system",
        label: "System lane",
        title: "A product problem distributed across the retrieval stack",
        summary: "The value is in treating personalization as a system change rather than a one-line feature request.",
        bullets: [
          "Signals, ranking, retrieval coverage, and explanation surfaces all matter.",
          "The work sits at the boundary between modeling behavior and product trust.",
          "That is where my PM style is strongest."
        ]
      },
      {
        id: "evaluation",
        label: "Evaluation lane",
        title: "Launch-safe iteration through offline and online measurement",
        summary: "This is not a black-box personalization story. The work depends on explicit success criteria.",
        bullets: [
          "Offline success criteria support hill-climbing without relying on intuition.",
          "Guarded online experimentation keeps rollout disciplined.",
          "Regression detection is part of the product surface, not an afterthought."
        ]
      },
      {
        id: "business",
        label: "Business takeaway",
        title: "This is high-leverage AI product judgment work",
        summary: "The hiring-manager value is that it shows I can work where system behavior, trust, and product direction intersect.",
        bullets: [
          "I can frame ambiguous AI quality problems in measurable ways.",
          "I can work fluently with engineering and data science on the same problem.",
          "I can help the team decide what is safe and useful enough to ship."
        ]
      }
    ],
    whatThisProves:
      "I can operate on AI product work where metric design, model behavior, and launch judgment are tightly coupled.",
    accent: "#6ef0c1",
    visualMode: "signal"
  },
  {
    slug: "copilot-extensibility-case-study",
    title: "Copilot Extensibility Onboarding",
    category: "Microsoft case study",
    focusArea: "AI product systems",
    archetype: "mission-schematic",
    thesis:
      "New content sources are only useful when the retrieval stack and measurement stack are ready for them at the same time.",
    description:
      "A non-confidential case study on onboarding new sources like Power BI and Viva Engage into M365 Chat, centered on grounding coverage, ranking quality, and regression-resistant launch criteria.",
    missionReadout: [
      { label: "Bull Signal", value: "Coverage expansion", detail: "New sources only matter if the assistant can retrieve and ground from them cleanly.", tone: "positive" },
      { label: "Vol Alert", value: "Platform drift", detail: "A new source can degrade quality if measurement lags behind onboarding.", tone: "caution" },
      { label: "Growth Trend", value: "Measured rollout", detail: "Grounding and regression gates keep platform expansion disciplined.", tone: "neutral" }
    ],
    stack: ["Content onboarding", "Search quality", "Measurement design", "Launch readiness"],
    comparisonChips: ["Grounding coverage", "Ranking quality", "Regression gates", "Launch readiness"],
    artifacts: ["Source onboarding plan", "Grounding coverage checks", "Regression gates"],
    evidence: [
      {
        label: "Platform lens",
        value: "The source only matters if indexing, retrieval, ranking, and measurement are ready together."
      },
      {
        label: "Launch lens",
        value: "Coverage checks and regression gates keep a new source from degrading the overall assistant experience."
      },
      {
        label: "Hiring signal",
        value: "Shows how I turn platform expansion into a measurable rollout plan instead of a vague integration story."
      }
    ],
    previewCards: [
      {
        title: "Source onboarding plan",
        subtitle: "Platform lane",
        note: "A rollout surface for bringing new content sources into M365 Chat without losing measurement discipline."
      },
      {
        title: "Grounding coverage checks",
        subtitle: "Quality lane",
        note: "Coverage and grounding become explicit checks instead of assumptions."
      },
      {
        title: "Regression gates",
        subtitle: "Launch lane",
        note: "Guardrails that keep source onboarding from degrading the whole experience."
      }
    ],
    drawerSections: [
      {
        id: "signal",
        label: "Platform lane",
        title: "Source onboarding as a product systems problem",
        summary: "The real work is coordinating retrieval readiness and measurement readiness at the same time.",
        bullets: [
          "A new source is only useful when the assistant can retrieve the right material from it.",
          "Coverage, indexing, ranking, and grounding all need to be ready together.",
          "This is platform expansion with operational discipline."
        ]
      },
      {
        id: "system",
        label: "System lane",
        title: "A source is not integrated just because it is connected",
        summary: "The interesting product work lives in the gap between integration and reliable user value.",
        bullets: [
          "The retrieval stack has to understand the new source well enough to use it.",
          "Ranking quality and grounding quality both need coverage checks.",
          "That turns platform work into a measurable product surface."
        ]
      },
      {
        id: "evaluation",
        label: "Evaluation lane",
        title: "Regression-resistant launch criteria",
        summary: "The point is to make expansion safer without slowing the team to a halt.",
        bullets: [
          "Grounding coverage checks act like pre-flight instrumentation.",
          "Regression gates create launch confidence instead of guesswork.",
          "Measurement design supports rollout decisions across teams."
        ]
      },
      {
        id: "business",
        label: "Business takeaway",
        title: "I can make platform growth measurable",
        summary: "This case study matters because it shows I can convert platform ambiguity into an execution plan people can ship against.",
        bullets: [
          "The work is strategic without losing systems detail.",
          "It improves the quality of cross-functional launch decisions.",
          "It is useful evidence for AI product roles that touch platform and search."
        ]
      }
    ],
    whatThisProves:
      "I can turn a fuzzy platform-expansion problem into a measurable rollout plan that engineering teams can execute against.",
    accent: "#7ce0ff",
    visualMode: "orbit"
  }
];

const writing: WritingEntry[] = [
  {
    slug: "learning-to-code-with-llms",
    title: "Learning to code with LLMs",
    date: "July 3, 2025",
    readTime: "2 min",
    summary:
      "A short note on using Codex and GPT-4o as part of the learning loop rather than as a substitute for understanding.",
    content: [
      "This site used to hold a single line: learning to code with LLMs. I kept that thought because it still matters. The useful version of LLM-assisted building is not blind delegation. It is faster iteration, better debugging prompts, tighter feedback loops, and a lower barrier to trying things that would otherwise sit in a backlog of intent.",
      "What interests me is the shift in leverage. The more technical context I have, the more useful these models become. That creates a healthy pressure to keep sharpening fundamentals instead of outsourcing them.",
      "For product work, the lesson is similar. Tools that feel magical on the surface still need measurement, evaluation, and human taste behind them. That applies whether the task is writing code, grounding a Copilot response, or deciding which experiment should ship next."
    ]
  }
];

const books: BookEntry[] = [
  {
    slug: "steve-jobs",
    title: "Steve Jobs",
    author: "Walter Isaacson",
    href: "https://www.amazon.com/Walter-IsaacsonsSteve-Jobs-Biography-Hardcover/dp/B006MS7TF8/ref=sr_1_14?crid=JHXX3WJZ6VPY",
    cover: "https://m.media-amazon.com/images/I/41EQKL0jMhL.jpg",
    note: "Biography as product taste study: intensity, clarity, and uncompromising standards.",
    tags: ["Biography", "Product taste"]
  },
  {
    slug: "the-innovators",
    title: "The Innovators",
    author: "Walter Isaacson",
    href: "https://www.amazon.com/Innovators-Inventors-Revolution-Nonfiction-2014-12-17/dp/B01JXR2ORC/ref=sr_1_2?crid=193U8JNTCH0B",
    cover: "https://m.media-amazon.com/images/I/415qDIsP77L._SY385_.jpg",
    note: "A reminder that major systems shifts usually come from teams, interfaces, and layered invention.",
    tags: ["Computing", "History"]
  },
  {
    slug: "elon-musk",
    title: "Elon Musk",
    author: "Walter Isaacson",
    href: "https://www.amazon.com/Elon-Musk-Walter-Isaacson/dp/1982181281/ref=tmm_hrd_swatch_0",
    cover: "https://m.media-amazon.com/images/I/81Kaj5++6pL._SY385_.jpg",
    note: "Useful for thinking about ambition, systems scale, and operational tempo.",
    tags: ["Biography", "Operations"]
  },
  {
    slug: "hitchhikers-guide",
    title: "The Hitchhiker's Guide to the Galaxy",
    author: "Douglas Adams",
    href: "https://www.amazon.com/Ultimate-Hitchhikers-Guide-Galaxy-Outrageous-ebook/dp/B0043M4ZH0/ref=sr_1_3?crid=192SZF1N7KGJX",
    cover: "https://m.media-amazon.com/images/I/A1fE+AMrKPL._SY385_.jpg",
    note: "A tonal counterweight: irreverence, absurdism, and perspective when systems get too serious.",
    tags: ["Fiction", "Perspective"]
  },
  {
    slug: "algorithms-to-live-by",
    title: "Algorithms to Live By",
    author: "Brian Christian and Tom Griffiths",
    href: "https://www.amazon.com/dp/1250118360/?bestFormat=true&k=algorithms%20to%20live%20by",
    cover: "https://m.media-amazon.com/images/I/81FrGZGHg0L._SY385_.jpg",
    note: "Good for turning abstract decision rules into everyday intuition.",
    tags: ["Decision making", "Computer science"]
  },
  {
    slug: "intelligent-investor",
    title: "The Intelligent Investor",
    author: "Benjamin Graham",
    href: "https://www.amazon.com/Intelligent-Investor-Definitive-Investing-Practical/dp/B09FM17SGF/ref=sr_1_5?crid=1XL4GN4BUQ7HJ",
    cover: "https://m.media-amazon.com/images/I/A1mm26lao7L._SY385_.jpg",
    note: "Markets, patience, and disciplined thinking under uncertainty.",
    tags: ["Markets", "Risk"]
  },
  {
    slug: "trading-chaos",
    title: "Trading Chaos",
    author: "Bill Williams",
    href: "https://www.amazon.com/Trading-Chaos-Maximize-Technical-Techniques/dp/0471463086/ref=sr_1_1?crid=D60IQDQQD6PH",
    cover: "https://m.media-amazon.com/images/I/714byZ+CIvL._SY425_.jpg",
    note: "A volatility and pattern lens from the markets side of my interests.",
    tags: ["Trading", "Systems"]
  },
  {
    slug: "changing-world-order",
    title: "The Changing World Order",
    author: "Ray Dalio",
    href: "https://www.amazon.com/Changing-World-Order-Nations-Succeed/dp/1982160276/ref=sr_1_1?crid=4MIVMHIV75K",
    cover: "https://m.media-amazon.com/images/I/416GBVPqdAL._SY445_SX342_.jpg",
    note: "Macro cycles and power transitions as another form of long-range systems analysis.",
    tags: ["Macro", "History"]
  },
  {
    slug: "zero-to-one",
    title: "Zero to One",
    author: "Peter Thiel",
    href: "https://www.amazon.com/Zero-to-One-audiobook/dp/B00M284NY2/ref=sr_1_1?crid=2DNO8L6FBCVZZ",
    cover: "https://m.media-amazon.com/images/I/71r+KgczQmL._SX342_.jpg",
    note: "Still one of the quicker ways to re-center on differentiation and asymmetric upside.",
    tags: ["Startups", "Strategy"]
  },
  {
    slug: "nvidia-way",
    title: "The Nvidia Way",
    author: "Tae Kim",
    href: "https://www.amazon.com/dp/1324086718/?bestFormat=true&k=nvidia%20way%20book",
    cover: "https://m.media-amazon.com/images/I/515FVMiDWfL._SY445_SX342_.jpg",
    note: "A current-tech angle on compounding strategy, hardware bets, and execution timing.",
    tags: ["Technology", "Execution"]
  },
  {
    slug: "stuff-matters",
    title: "Stuff Matters",
    author: "Mark Miodownik",
    href: "https://www.amazon.com/Stuff-Matters-Exploring-Marvelous-Materials/dp/0544483944/ref=sr_1_1?crid=2J8BMSAGVC6XJ",
    cover: "https://m.media-amazon.com/images/I/51aoao+BhQL._SY445_SX342_.jpg",
    note: "A materials-science detour that keeps the curiosity range wide.",
    tags: ["Science", "Curiosity"]
  }
];

export const profileContent: ProfileContent = {
  name: "Siddhant Agarwal",
  shortName: "Sid Agarwal",
  title: "Technical PM / product-builder hybrid focused on AI search, grounded Copilot systems, and notebook-backed data science work.",
  location: "Charlotte, NC · Microsoft · Remote",
  heroSummary:
    "I build at the seam between product direction and technical depth. The core of my work is retrieval-heavy AI: search relevance, M365 Chat, Copilot grounding, evaluation systems, and launch decisions that hold up under production scrutiny. Outside the day job, I like systems that feel like mission control: notebooks, dashboards, space, markets, and products that make noisy signals easier to act on.",
  heroBullets: [
    "Senior PM at Microsoft working on Search Relevance and Copilot-grounded experiences.",
    "B.S. in Business Administration and Operations / Supply Chain, plus an Economics minor from UNC Charlotte.",
    "M.S. in Data Science and Business Analytics in progress, expected December 2026.",
    "Interested in AI systems, markets, space, and products that make complex systems legible."
  ],
  avatarUrl: "https://avatars.githubusercontent.com/sidagarwal-labs",
  resumeHref,
  socials: [
    { label: "Email", shortLabel: "Mail", href: "mailto:sid.webster@gmail.com" },
    { label: "LinkedIn", shortLabel: "In", href: "https://www.linkedin.com/in/sid-agarwal-480a68162/" },
    { label: "GitHub", shortLabel: "GH", href: "https://github.com/sidagarwal-labs" },
    { label: "Resume", shortLabel: "CV", href: resumeHref }
  ],
  heroStats: [
    { label: "Primary orbit", value: "AI search + Copilot", detail: "Grounding, ranking, evaluation" },
    { label: "Current trajectory", value: "M.S. in Data Science", detail: "Expected Dec 2026" }
  ],
  missionReadout: [
    { label: "Bull Signal", value: "Launch + grounded AI", detail: "Copilot retrieval quality, ranking systems, and mission telemetry.", tone: "positive" },
    { label: "Growth Trend", value: "LLM + infra depth", detail: "Notebook-led model work compounding with systems and platform understanding.", tone: "positive" },
    { label: "Exposure", value: "Space, autonomy, compute", detail: "SpaceX cadence, self-driving stacks, data centers, and frontier hardware.", tone: "neutral" },
    { label: "Runway", value: "Capex to revenue lens", detail: "Wall Street framing: investment cycles, monetization, and execution discipline.", tone: "caution" }
  ],
  navLinks,
  sceneSections,
  experience,
  projects,
  writing,
  books
};

