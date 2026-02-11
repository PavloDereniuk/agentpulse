import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import "./NetworkGraph.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function NetworkGraph() {
  const svgRef = useRef();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchGraphData();
  }, []);

  const fetchGraphData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/network/graph`);
      const result = await response.json();
      if (result.success) {
        setData(result);
        setStats(result.stats);
        console.log(
          "Community agents:",
          result.nodes.filter((n) => n.type === "other"),
        );
        setLoading(false);
      }
    } catch (error) {
      console.error("Failed to fetch graph data:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data || !svgRef.current) return;

    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Enhanced color scale by category
    const categoryColors = {
      Analytics: "#667eea",
      "AI Agent": "#10b981",
      Development: "#3b82f6",
      Trading: "#f59e0b",
      DeFi: "#8b5cf6",
      Security: "#ef4444",
      Social: "#ec4899",
      Infrastructure: "#06b6d4",
      Community: "#6b7280",
      Other: "#64748b",
      "Meta-AI": "#a855f7",
      Information: "#14b8a6",
      Creative: "#f97316",
      Reputation: "#84cc16",
    };

    const getNodeColor = (node) => {
      if (node.type === "self") return "#667eea"; // AgentPulse - фіолетовий
      if (node.type === "other") return "#f43f5e"; // Community agents - яскраво рожевий
      return categoryColors[node.category] || "#10b981";
    };

    // Create SVG with gradient definitions
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Add gradients for glow effect
    const defs = svg.append("defs");

    // Glow filter for central node
    const filter = defs
      .append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    filter
      .append("feGaussianBlur")
      .attr("stdDeviation", "4")
      .attr("result", "coloredBlur");

    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g");

    // Add zoom with limits
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        }),
    );

    // Force simulation with better parameters
    const simulation = d3
      .forceSimulation(data.nodes)
      .force(
        "link",
        d3
          .forceLink(data.edges)
          .id((d) => d.id)
          .distance((d) => {
            if (d.source.type === "self" || d.target.type === "self")
              return 150;
            return 200;
          })
          .strength(0.5),
      )
      .force(
        "charge",
        d3.forceManyBody().strength((d) => (d.type === "self" ? -1000 : -300)),
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3
          .forceCollide()
          .radius((d) => (d.type === "self" ? 50 : d.reputation / 10 + 15)),
      );

    // Create gradient links
    const linkGradients = g
      .append("defs")
      .selectAll("linearGradient")
      .data(data.edges)
      .join("linearGradient")
      .attr("id", (d, i) => `link-gradient-${i}`)
      .attr("gradientUnits", "userSpaceOnUse");

    linkGradients
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#667eea")
      .attr("stop-opacity", 0.8);

    linkGradients
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#10b981")
      .attr("stop-opacity", 0.3);

    // Create links with gradients
    const link = g
      .append("g")
      .selectAll("line")
      .data(data.edges)
      .join("line")
      .attr("stroke", (d, i) => `url(#link-gradient-${i})`)
      .attr("stroke-opacity", (d) => (d.type === "vote" ? 0.6 : 0.2))
      .attr("stroke-width", (d) => {
        if (d.confidence) return d.confidence * 3;
        return d.type === "vote" ? 2 : 1;
      })
      .attr("class", "network-link");

    // Create node groups
    const node = g
      .append("g")
      .selectAll("g")
      .data(data.nodes)
      .join("g")
      .attr("class", "network-node")
      .call(drag(simulation));

    // Add outer ring for important nodes
    node
      .filter(
        (d) => d.reputation > 85 || d.type === "self" || d.type === "other",
      )
      .append("circle")
      .attr("r", (d) => {
        if (d.type === "self") return 38;
        if (d.type === "other") return 28;
        return d.reputation / 10 + 13;
      })
      .attr("fill", "none")
      .attr("stroke", (d) => getNodeColor(d))
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.3)
      .attr("class", "node-ring");

    // Main circles
    node
      .append("circle")
      .attr("r", (d) => {
        if (d.type === "self") return 35;
        if (d.type === "other") return 25; // Community agents більші
        return d.reputation / 10 + 10;
      })
      .attr("fill", (d) => getNodeColor(d))
      .attr("stroke", "#fff")
      .attr("stroke-width", (d) => (d.type === "self" ? 3 : 2))
      .attr("filter", (d) => (d.type === "self" ? "url(#glow)" : null))
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("r", (d) => {
            if (d.type === "self") return 40;
            if (d.type === "other") return 30;
            return d.reputation / 10 + 15;
          });

        // Highlight connected links
        link
          .transition()
          .duration(200)
          .attr("stroke-opacity", (l) =>
            l.source.id === d.id || l.target.id === d.id ? 0.8 : 0.1,
          );

        setSelectedNode(d);
      })
      .on("mouseout", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("r", (d) => {
            if (d.type === "self") return 35;
            if (d.type === "other") return 25;
            return d.reputation / 10 + 10;
          });

        // Reset links
        link
          .transition()
          .duration(200)
          .attr("stroke-opacity", (l) => (l.type === "vote" ? 0.6 : 0.2));
      });

    // Labels for all important nodes
    // Labels for all important nodes
    node
      .filter(
        (d) => d.type === "self" || d.type === "other" || d.reputation > 85,
      )
      .append("text")
      .text((d) => d.name)
      .attr(
        "font-size",
        (d) => (d.type === "self" ? 12 : d.type === "other" ? 12 : 11), // ⬅️ ЗМЕНШЕНО для self
      )
      .attr("font-weight", (d) =>
        d.type === "self" ? "bold" : d.type === "other" ? "600" : "normal",
      )
      .attr(
        "fill",
        (d) => (d.type === "self" ? "#e2e8f0" : "#1f2937"), // ⬅️ СВІТЛІШИЙ для self
      )
      .attr("text-anchor", "middle")
      .attr(
        "dy",
        (d) => (d.type === "self" ? 48 : d.type === "other" ? 40 : 30), // ⬅️ ТРОХИ БЛИЖЧЕ
      )
      .style("pointer-events", "none")
      .attr("class", "node-label")
      .style(
        "text-shadow",
        (d) =>
          d.type === "self"
            ? "0 1px 4px rgba(0,0,0,0.8)"
            : "0 0 3px rgba(255,255,255,0.8)", // ⬅️ ТІНЬ для читабельності
      );

    // Pulse animation for central node
    node
      .filter((d) => d.type === "self")
      .select("circle")
      .append("animate")
      .attr("attributeName", "r")
      .attr("values", "35;38;35")
      .attr("dur", "2s")
      .attr("repeatCount", "indefinite");

    // Update positions on tick
    simulation.on("tick", () => {
      // Update gradient positions
      linkGradients
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Drag behavior
    function drag(simulation) {
      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
  }, [data]);

  if (loading) {
    return (
      <div className="network-container">
        <div className="loading">Loading network graph...</div>
      </div>
    );
  }

  return (
    <div className="network-container">
      <div className="network-header">
        <h1>🌐 Agent Network</h1>
        <p className="subtitle">
          Interactive visualization of AgentPulse ecosystem connections
        </p>
      </div>

      {stats && (
        <div className="network-stats">
          <div className="stat-box">
            <div className="stat-value">{stats.totalNodes}</div>
            <div className="stat-label">NODES</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{stats.ourVotes}</div>
            <div className="stat-label">OUR VOTES</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{stats.totalEdges}</div>
            <div className="stat-label">CONNECTIONS</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{stats.categories.length}</div>
            <div className="stat-label">CATEGORIES</div>
          </div>
        </div>
      )}

      <div className="legend">
        <div className="legend-item">
          <div
            className="legend-color"
            style={{ backgroundColor: "#667eea" }}
          ></div>
          <span>AgentPulse (Us)</span>
        </div>
        <div className="legend-item">
          <div
            className="legend-color"
            style={{ backgroundColor: "#10b981" }}
          ></div>
          <span>Projects We Voted For ({stats.ourVotes})</span>
        </div>
      </div>

      <div className="graph-controls">
        <p className="hint">
          💡 Drag nodes • Scroll to zoom • Hover for details
        </p>
      </div>

      <div className="graph-canvas">
        <svg ref={svgRef}></svg>
      </div>

      {selectedNode && (
        <div className="node-info">
          <div className="node-info-header">
            <h3>{selectedNode.name}</h3>
            <button className="close-btn" onClick={() => setSelectedNode(null)}>
              ×
            </button>
          </div>
          <div className="node-info-body">
            <div className="info-row">
              <span className="info-label">Type:</span>
              <span className="info-value">
                {selectedNode.type === "self"
                  ? "AgentPulse"
                  : selectedNode.type === "other"
                    ? "Community Agent"
                    : "Project"}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Reputation:</span>
              <div className="reputation-bar">
                <div
                  className="reputation-fill"
                  style={{ width: `${selectedNode.reputation}%` }}
                ></div>
              </div>
              <span className="info-value">{selectedNode.reputation}/100</span>
            </div>
            {selectedNode.score && (
              <div className="info-row">
                <span className="info-label">Score:</span>
                <span className="info-value score">
                  {selectedNode.score.toFixed(1)}/10
                </span>
              </div>
            )}
            {selectedNode.category && (
              <div className="info-row">
                <span className="info-label">Category:</span>
                <span className="info-value badge">
                  {selectedNode.category}
                </span>
              </div>
            )}
            {selectedNode.upvotes !== undefined && (
              <div className="info-row">
                <span className="info-label">Upvotes:</span>
                <span className="info-value">👍 {selectedNode.upvotes}</span>
              </div>
            )}
            {selectedNode.votes && (
              <div className="info-row">
                <span className="info-label">Total Votes:</span>
                <span className="info-value">🗳️ {selectedNode.votes}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NetworkGraph;
