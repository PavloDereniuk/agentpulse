import React, { useState } from "react";
import "./Evaluator.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function Evaluator() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleEvaluate = async () => {
    if (!input.trim()) {
      setError("Please enter a project ID or name");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Check if input is number (ID) or text (name)
      const isNumeric = /^\d+$/.test(input.trim());

      const response = await fetch(`${API_URL}/api/evaluate/live`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          isNumeric
            ? { projectId: parseInt(input) }
            : { projectName: input.trim() },
        ),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || "Evaluation failed");
      }
    } catch (err) {
      console.error("Evaluation error:", err);
      setError("Failed to connect to evaluator. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleEvaluate();
    }
  };

  const getRecommendationColor = (rec) => {
    if (rec === "STRONG_YES") return "#10b981";
    if (rec === "YES") return "#3b82f6";
    if (rec === "NO") return "#ef4444";
    return "#9ca3af";
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 0.9) return "#10b981";
    if (conf >= 0.8) return "#3b82f6";
    if (conf >= 0.7) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="evaluator-container">
      <div className="evaluator-header">
        <h1>🤖 Live AI Evaluator</h1>
        <p className="subtitle">
          Get real-time AI evaluation of any hackathon project
        </p>
      </div>

      {/* Input Section */}
      <div className="evaluator-input-section">
        <div className="input-card">
          <h2>Evaluate a Project</h2>
          <p className="input-hint">
            Enter a project ID (e.g., 564) or name (e.g., "Hydra")
          </p>

          <div className="input-group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Project ID or name..."
              className="eval-input"
              disabled={loading}
            />
            <button
              onClick={handleEvaluate}
              disabled={loading}
              className="eval-button"
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Evaluating...
                </>
              ) : (
                <>🧠 Evaluate</>
              )}
            </button>
          </div>

          {error && (
            <div className="error-message">
              <div className="error-title">⚠️ {error}</div>
              {error.includes("not found") && (
                <div className="error-hint">
                  💡 Tips:
                  <ul>
                    <li>Use project ID (e.g., 564, not agent ID 503)</li>
                    <li>Try searching with exact project name</li>
                    <li>Check project page for correct ID</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="info-card">
          <h3>💡 How it works</h3>
          <ul>
            <li>
              <strong>Objective Analysis (40%):</strong> GitHub, demo,
              description quality
            </li>
            <li>
              <strong>AI Evaluation (60%):</strong> Innovation, effort,
              potential, ecosystem fit
            </li>
            <li>
              <strong>Final Score:</strong> Weighted combination with confidence
              level
            </li>
            <li>
              <strong>Reasoning:</strong> Full 100+ line explanation of the
              decision
            </li>
          </ul>
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="results-section">
          {/* Project Info */}
          <div className="result-card project-info">
            <h2>
              {result.project.name}
              {result.generated === "LIVE" && (
                <span className="live-badge">🔴 LIVE</span>
              )}
            </h2>
            {result.project.tagline && (
              <p className="tagline">{result.project.tagline}</p>
            )}
            <p className="description">{result.project.description}</p>
          </div>

          {/* Scores */}
          <div className="scores-grid">
            <div className="score-card">
              <div className="score-label">Objective Score</div>
              <div className="score-value">
                {result.evaluation.objectiveScore.toFixed(1)}/10
              </div>
              <div className="score-sublabel">GitHub, Demo, Description</div>
            </div>

            <div className="score-card">
              <div className="score-label">AI Score</div>
              <div className="score-value">
                {result.evaluation.aiScore.toFixed(1)}/10
              </div>
              <div className="score-sublabel">Claude Evaluation</div>
            </div>

            <div className="score-card highlight">
              <div className="score-label">Final Score</div>
              <div className="score-value final">
                {result.evaluation.finalScore.toFixed(1)}/10
              </div>
              <div className="score-sublabel">(40% Obj + 60% AI)</div>
            </div>

            <div className="score-card">
              <div className="score-label">Recommendation</div>
              <div
                className="score-value recommendation"
                style={{
                  color: getRecommendationColor(
                    result.evaluation.recommendation,
                  ),
                }}
              >
                {result.evaluation.recommendation.replace("_", " ")}
              </div>
              <div className="score-sublabel">
                Confidence: {(result.evaluation.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* AI Breakdown */}
          {result.evaluation.breakdown && (
            <div className="result-card breakdown">
              <h3>🎯 AI Evaluation Breakdown</h3>
              <div className="breakdown-container">
                {/* Scores Grid - 2x2 */}
                <div className="breakdown-scores">
                  <div className="breakdown-item">
                    <div className="breakdown-label">Innovation</div>
                    <div className="breakdown-value">
                      {result.evaluation.breakdown.innovation}/10
                    </div>
                  </div>
                  <div className="breakdown-item">
                    <div className="breakdown-label">Effort</div>
                    <div className="breakdown-value">
                      {result.evaluation.breakdown.effort}/10
                    </div>
                  </div>
                  <div className="breakdown-item">
                    <div className="breakdown-label">Potential</div>
                    <div className="breakdown-value">
                      {result.evaluation.breakdown.potential}/10
                    </div>
                  </div>
                  <div className="breakdown-item">
                    <div className="breakdown-label">Ecosystem Fit</div>
                    <div className="breakdown-value">
                      {result.evaluation.breakdown.ecosystemFit}/10
                    </div>
                  </div>
                  {result.evaluation.breakdown.overall && (
                    <div className="breakdown-item overall">
                      <div className="breakdown-label">Overall</div>
                      <div className="breakdown-value">
                        {result.evaluation.breakdown.overall}/10
                      </div>
                    </div>
                  )}
                </div>

                {/* Reasoning separately */}
                {result.evaluation.breakdown.reasoning && (
                  <div className="breakdown-reasoning">
                    <div className="reasoning-label">Claude's Assessment:</div>
                    <p>{result.evaluation.breakdown.reasoning}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reasoning */}
          <div className="result-card reasoning">
            <h3>🧠 Detailed Reasoning</h3>
            <pre className="reasoning-text">{result.reasoning}</pre>
          </div>

          {/* Decision Factors */}
          {result.factors && Object.keys(result.factors).length > 0 && (
            <div className="result-card factors">
              <h3>📊 Decision Factors</h3>
              <div className="factors-grid">
                {Object.entries(result.factors).map(([key, value]) => (
                  <div key={key} className="factor-item">
                    <span className="factor-key">{key}:</span>
                    <span className="factor-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Evaluator;
