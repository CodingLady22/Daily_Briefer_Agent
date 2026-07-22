// Compiles the LangGraph pipeline: supervisor -> parallel research -> synthesis -> personalization -> email.
import { StateGraph, START, END } from "@langchain/langgraph";
import { DigestState } from "./state.js";
import { supervisorNode } from "./supervisor.js";
import { webSearchAgent } from "../agents/webSearch.agent.js";
import { benchmarkAgent } from "../agents/benchmark.agent.js";
import { pricingAgent } from "../agents/pricing.agent.js";
import { synthesisAgent } from "../agents/synthesis.agent.js";
import { personalizationAgent } from "../agents/personalization.agent.js";
import { emailFormatterAgent } from "../agents/emailFormatter.agent.js";

const graph = new StateGraph(DigestState)
  .addNode("supervisor", supervisorNode)
  .addNode("webSearch", webSearchAgent)
  .addNode("benchmark", benchmarkAgent)
  .addNode("pricing", pricingAgent)
  .addNode("synthesis", synthesisAgent)
  .addNode("personalization", personalizationAgent)
  .addNode("emailFormatter", emailFormatterAgent)
  .addEdge(START, "supervisor")
  // fan out — supervisor hands off to the three parallel research agents
  .addEdge("supervisor", "webSearch")
  .addEdge("supervisor", "benchmark")
  .addEdge("supervisor", "pricing")
  // fan in — synthesis waits for all three
  .addEdge("webSearch", "synthesis")
  .addEdge("benchmark", "synthesis")
  .addEdge("pricing", "synthesis")
  .addEdge("synthesis", "personalization")
  .addEdge("personalization", "emailFormatter")
  .addEdge("emailFormatter", END);

export const digestGraph = graph.compile();
