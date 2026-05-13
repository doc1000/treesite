import { applyContentItems } from "./contentItems";
import { generatedContentItems } from "./generatedContentItems";

export const rootOrder = [
  "Home / Who I Am",
  "Services",
  "Case Studies",
  "Articles",
  "Contact Me"
];

const baseSiteData = {
  name: "Website",
  description: "Full sitemap view.",
  children: [
    {
      name: "Home / Who I Am",
      value: 40,
      color: "#5d8fb3",
      description: "The front door: positioning, story, credibility, and next action.",
      children: [
        {
          name: "Media",
          value: 10,
          description: "Portraits, short intro video, downloadable bio.",
          children: []
        }
      ]
    },
    {
      name: "Services",
      value: 52,
      color: "#8b79b8",
      description: "Primary offers and paths for prospective clients.",
      children: [
        {
          name: "Service Assets",
          value: 10,
          description: "Sales decks, scope examples, screenshots.",
          children: []
        }
      ]
    },
    {
      name: "Case Studies",
      value: 42,
      color: "#c58b78",
      description: "Outcome-driven stories showing transformation.",
      children: [
        {
          name: "Client A",
          value: 14,
          description: "Problem, approach, result, evidence.",
          children: []
        },
      ]
    },
    {
      name: "Articles",
      value: 58,
      color: "#6fa892",
      description: "Published research, toolkits, articles, and future writing ideas.",
      children: [
        {
          name: "Research",
          value: 18,
          description: "Technical research notes and papers.",
          children: []
        },
        {
          name: "Systems & Tooling",
          value: 16,
          description: "Practical build notes, teardown posts, and toolkits.",
          children: []
        },
        {
          name: "Publications",
          value: 16,
          description: "External articles, essays, and publication-ready writing.",
          children: []
        },
      ]
    },
    {
      name: "Contact Me",
      value: 30,
      color: "#c7ad72",
      description: "Need AI knowledge tools now? Reach out or schedule a call.",
      children: []
    }
  ]
};

export const siteData = applyContentItems(baseSiteData, generatedContentItems);