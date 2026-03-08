"""
Domain constants and knowledge graph.

Architecture Decision:
  The DOMAIN_KNOWLEDGE graph encodes prerequisite relationships between
  programming and ML concepts. This is used for:
  1. Enriching Bedrock analysis with known dependency edges
  2. Rule-based fallback when Bedrock is unavailable
  3. Validating concept names in API requests
  4. Building the cognitive debt map visualization

  The graph is intentionally static and shipped with the code.
  A future version could load this from DynamoDB for dynamic updates.
"""

# ---------------------------------------------------------------------------
# Valid enum values — used for schema enforcement
# ---------------------------------------------------------------------------
VALID_UNDERSTANDING_LEVELS = frozenset({"surface", "partial", "solid", "deep"})

VALID_DEBT_TYPES = frozenset({
    "circular",
    "parroting",
    "logical_jump",
    "confidence_mismatch",
    "wrong_reasoning",
})

VALID_INTERVENTION_TYPES = frozenset({
    "clarification",
    "counter_example",
    "mental_model",
    "aha_bridge",
})

VALID_EVIDENCE_TYPES = frozenset({"explanation", "code", "qa_reasoning"})

# ---------------------------------------------------------------------------
# Level weights for progress calculation
# ---------------------------------------------------------------------------
LEVEL_WEIGHTS = {
    "surface": 0.15,
    "partial": 0.40,
    "solid": 0.75,
    "deep": 1.00,
}

# ---------------------------------------------------------------------------
# Domain Knowledge Graph
# Key = concept (snake_case), Value = list of prerequisite concepts.
# ---------------------------------------------------------------------------
DOMAIN_KNOWLEDGE = {
    # --- Core Languages ---
    "python": ["variables", "control_flow", "functions", "data_types"],
    "javascript": ["variables", "control_flow", "functions", "data_types"],
    "java": ["variables", "control_flow", "functions", "classes"],
    "c": ["variables", "control_flow", "functions"],
    "cpp": ["c", "classes", "functions"],
    "typescript": ["javascript", "type_hints"],
    "html": [],
    "css": ["html"],

    # --- Python Fundamentals ---
    "variables": [],
    "data_types": ["variables"],
    "operators": ["variables", "data_types"],
    "strings": ["variables", "data_types"],
    "lists": ["variables", "data_types"],
    "dictionaries": ["variables", "data_types", "lists"],
    "tuples": ["variables", "data_types", "lists"],
    "sets": ["variables", "data_types", "lists"],
    "control_flow": ["variables", "operators"],
    "loops": ["control_flow", "lists"],
    "functions": ["variables", "control_flow"],
    "scope": ["variables", "functions"],
    "closures": ["functions", "scope"],
    "decorators": ["functions", "closures"],
    "generators": ["functions", "loops"],
    "iterators": ["loops", "functions"],

    # --- OOP ---
    "classes": ["functions", "variables", "data_types"],
    "inheritance": ["classes"],
    "polymorphism": ["classes", "inheritance"],
    "magic_methods": ["classes"],
    "abstract_classes": ["classes", "inheritance"],
    "composition": ["classes"],

    # --- Error Handling & Modules ---
    "exceptions": ["control_flow", "classes"],
    "modules": ["functions"],
    "file_io": ["strings", "exceptions"],

    # --- Functional ---
    "list_comprehensions": ["lists", "loops", "functions"],
    "lambda": ["functions"],
    "map_filter_reduce": ["functions", "lambda", "lists"],
    "recursion": ["functions", "control_flow"],

    # --- Advanced Python ---
    "type_hints": ["variables", "functions", "data_types"],
    "dataclasses": ["classes", "type_hints"],
    "context_managers": ["classes", "exceptions"],
    "async_await": ["functions", "generators"],
    "metaclasses": ["classes", "decorators"],
    "descriptors": ["classes", "decorators"],

    # --- Data Science ---
    "numpy_basics": ["lists", "loops", "operators"],
    "pandas_basics": ["dictionaries", "numpy_basics"],
    "matplotlib_basics": ["numpy_basics", "lists"],
    "linear_algebra": ["numpy_basics", "operators"],
    "statistics_basics": ["numpy_basics"],
    "data_cleaning": ["pandas_basics", "strings"],
    "data_visualization": ["matplotlib_basics", "pandas_basics"],

    # --- ML Foundations ---
    "supervised_learning": ["statistics_basics", "linear_algebra", "numpy_basics"],
    "linear_regression": ["supervised_learning", "linear_algebra"],
    "logistic_regression": ["supervised_learning", "statistics_basics"],
    "decision_trees": ["supervised_learning"],
    "random_forests": ["decision_trees"],
    "svm": ["supervised_learning", "linear_algebra"],
    "naive_bayes": ["supervised_learning", "statistics_basics"],

    # --- Deep Learning ---
    "neural_networks": ["linear_algebra", "supervised_learning"],
    "gradient_descent": ["neural_networks", "linear_algebra"],
    "backpropagation": ["neural_networks", "gradient_descent"],
    "activation_functions": ["neural_networks"],
    "loss_functions": ["neural_networks", "statistics_basics"],
    "optimizers": ["gradient_descent"],
    "cnn": ["neural_networks"],
    "rnn": ["neural_networks"],
    "transformers": ["neural_networks", "rnn"],
    "attention_mechanism": ["rnn", "linear_algebra"],

    # --- ML Engineering ---
    "overfitting": ["supervised_learning", "statistics_basics"],
    "cross_validation": ["supervised_learning", "overfitting"],
    "feature_engineering": ["pandas_basics", "supervised_learning"],
    "hyperparameter_tuning": ["cross_validation"],
    "model_evaluation": ["supervised_learning", "statistics_basics"],
    "bias_variance": ["overfitting", "statistics_basics"],

    # --- Unsupervised Learning ---
    "unsupervised_learning": ["statistics_basics", "numpy_basics"],
    "clustering": ["unsupervised_learning", "linear_algebra"],
    "dimensionality_reduction": ["unsupervised_learning", "linear_algebra"],
    "pca": ["dimensionality_reduction", "linear_algebra"],
    "kmeans": ["clustering"],
}

# ---------------------------------------------------------------------------
# Concept metadata for rule-based fallback analysis
# ---------------------------------------------------------------------------
CONCEPT_DIFFICULTY = {
    "variables": 1, "data_types": 1, "operators": 1, "strings": 2,
    "lists": 2, "dictionaries": 2, "tuples": 2, "sets": 2,
    "control_flow": 2, "loops": 2, "functions": 3, "scope": 3,
    "closures": 4, "decorators": 4, "generators": 4, "iterators": 3,
    "classes": 3, "inheritance": 3, "polymorphism": 4, "magic_methods": 4,
    "abstract_classes": 4, "composition": 3, "exceptions": 3, "modules": 2,
    "file_io": 2, "list_comprehensions": 3, "lambda": 3,
    "map_filter_reduce": 3, "recursion": 4, "type_hints": 2,
    "dataclasses": 3, "context_managers": 4, "async_await": 5,
    "metaclasses": 5, "descriptors": 5,
    "numpy_basics": 2, "pandas_basics": 3, "matplotlib_basics": 2,
    "linear_algebra": 4, "statistics_basics": 3, "data_cleaning": 3,
    "data_visualization": 3,
    "supervised_learning": 4, "linear_regression": 3, "logistic_regression": 4,
    "decision_trees": 3, "random_forests": 4, "svm": 5, "naive_bayes": 3,
    "neural_networks": 5, "gradient_descent": 4, "backpropagation": 5,
    "activation_functions": 3, "loss_functions": 4, "optimizers": 4,
    "cnn": 5, "rnn": 5, "transformers": 5, "attention_mechanism": 5,
    "overfitting": 3, "cross_validation": 3, "feature_engineering": 4,
    "hyperparameter_tuning": 3, "model_evaluation": 3, "bias_variance": 4,
    "unsupervised_learning": 4, "clustering": 3, "dimensionality_reduction": 4,
    "pca": 4, "kmeans": 3,
}

# ---------------------------------------------------------------------------
# Keywords that indicate understanding depth (used by rule-based fallback)
# ---------------------------------------------------------------------------
DEPTH_KEYWORDS = {
    "deep": [
        "because", "therefore", "underlying", "tradeoff", "trade-off",
        "internally", "under the hood", "memory", "complexity",
        "time complexity", "space complexity", "optimization", "edge case",
        "invariant", "proof", "mathematically", "asymptotic",
    ],
    "solid": [
        "for example", "such as", "specifically", "in practice",
        "use case", "difference between", "compared to", "advantage",
        "disadvantage", "when to use", "real world", "implement",
    ],
    "partial": [
        "basically", "sort of", "kind of", "simple", "easy",
        "just", "only", "pretty much",
    ],
    "surface": [
        "i think", "maybe", "not sure", "i guess", "probably",
        "something like", "heard that", "read that",
    ],
}

DEBT_KEYWORDS = {
    "circular": [
        "is a", "is basically", "means", "defined as",
    ],
    "parroting": [
        "textbook", "definition", "according to", "is defined as",
        "wikipedia", "as per",
    ],
    "logical_jump": [
        "so then", "obviously", "clearly", "of course", "naturally",
        "it follows", "therefore",
    ],
}
