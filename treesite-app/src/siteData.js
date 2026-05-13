export const rootOrder = [
  "Home / Who I Am",
  "Services",
  "Case Studies",
  "Articles",
  "Contact Me"
];

export const siteData = {
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
          name: "Hero Statement",
          value: 12,
          description: "Core promise, simple intro, primary CTA."
        },
        {
          name: "Origin Story",
          value: 10,
          description: "A short founder story that makes the work feel human."
        },
        {
          name: "Proof / Trust",
          value: 8,
          description: "Logos, testimonials, credentials, awards, or outcomes."
        },
        {
          name: "Media",
          value: 10,
          description: "Portraits, short intro video, downloadable bio.",
          children: [
            {
              name: "Portrait.jpg",
              value: 4,
              description: "Personal brand image asset."
            },
            {
              name: "Intro Video",
              value: 4,
              description: "Embedded video or reel."
            },
            {
              name: "Bio PDF",
              value: 2,
              description: "Downloadable one-sheet."
            }
          ]
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
          name: "Strategy Sessions",
          value: 14,
          description: "Advisory offer with scheduling CTA."
        },
        {
          name: "AI Implementation",
          value: 16,
          description: "Build workflows, agents, automations, or prototypes."
        },
        {
          name: "Workshops",
          value: 12,
          description: "Team training and executive education."
        },
        {
          name: "Service Assets",
          value: 10,
          description: "Sales decks, scope examples, screenshots.",
          children: [
            {
              name: "Workshop Deck",
              value: 4,
              description: "Embedded presentation."
            },
            {
              name: "Process Diagram",
              value: 3,
              description: "Image or SVG explaining your method."
            },
            {
              name: "Sample SOW",
              value: 3,
              description: "Downloadable document."
            }
          ]
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
          children: [
            {
              name: "Before / After",
              value: 5,
              description: "Visual comparison asset."
            },
            {
              name: "Metrics",
              value: 5,
              description: "Revenue, time saved, quality, cost, speed."
            },
            {
              name: "Testimonial",
              value: 4,
              description: "Quote, video, or screenshot."
            }
          ]
        },
        {
          name: "Client B",
          value: 12,
          description: "Second outcome story."
        },
        {
          name: "Client C",
          value: 10,
          description: "A third story organized as a page."
        },
        {
          name: "Evidence Library",
          value: 6,
          description: "Screenshots, charts, PDFs, anonymized outputs."
        }
      ]
    },
    {
      name: "Articles",
      value: 46,
      color: "#6fa892",
      description: "Thought leadership, essays, tutorials, and evergreen resources.",
      children: [
        {
          name: "AI Strategy",
          value: 13,
          description: "Articles about business strategy and implementation."
        },
        {
          name: "Automation Notes",
          value: 11,
          description: "Practical build notes, teardown posts, and tools."
        },
        {
          name: "Personal Essays",
          value: 9,
          description: "Point-of-view writing and founder perspective."
        },
        {
          name: "Resource Library",
          value: 13,
          description: "Downloads and visuals.",
          children: [
            {
              name: "Playbook PDF",
              value: 5,
              description: "Downloadable guide."
            },
            {
              name: "Prompt Pack",
              value: 4,
              description: "Reusable prompt library."
            },
            {
              name: "Images",
              value: 4,
              description: "Charts, diagrams, article art."
            }
          ]
        }
      ]
    },
    {
      name: "Contact Me",
      value: 22,
      color: "#c7ad72",
      template: "contact",
      description: "Need AI knowledge tools now? Reach out through email, GitHub, or LinkedIn.",
      links: [
        {
          label: "info@knowledgealgorithms.com",
          href: "mailto:info@knowledgealgorithms.com"
        },
        {
          label: "github.com/doc1000",
          href: "https://github.com/doc1000"
        },
        {
          label: "linkedin.com/in/dosteresh",
          href: "https://www.linkedin.com/in/dosteresh/"
        }
      ],
      children: [
        {
          name: "Email",
          value: 8,
          kicker: "Primary channel",
          template: "contact",
          description: "Need AI knowledge tools now? Reach out directly by email.",
          links: [
            {
              label: "info@knowledgealgorithms.com",
              href: "mailto:info@knowledgealgorithms.com"
            }
          ]
        },
        {
          name: "GitHub",
          value: 7,
          kicker: "Code / prototypes",
          template: "contact",
          description: "Explore public work, experiments, and technical artifacts.",
          links: [
            {
              label: "github.com/doc1000",
              href: "https://github.com/doc1000"
            }
          ]
        },
        {
          name: "LinkedIn",
          value: 7,
          kicker: "Professional profile",
          template: "contact",
          description: "Connect professionally and see current background, work, and updates.",
          links: [
            {
              label: "linkedin.com/in/dosteresh",
              href: "https://www.linkedin.com/in/dosteresh/"
            }
          ]
        }
      ]
    }
  ]
};