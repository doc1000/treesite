import divariancePdf from "./assets/Divariance_ Connecting Frechet and KL Divergence-1.pdf";
import volatilityToolkitPdf from "./assets/Volatility-Mitigation-Toolkit.pdf";
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
/*         {
          name: "Client B",
          value: 12,
          description: "Second outcome story."
        },
        {
          name: "Client C",
          value: 10,
          description: "A third story organized as a page."
        },
 */        {
          name: "Evidence Library",
          value: 6,
          description: "Screenshots, charts, PDFs, anonymized outputs."
        }
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
          children: [
            {
              name: "Divariance: Connecting Fréchet and KL Divergence",
              title: "Divariance: Connecting Fréchet and KL Divergence",
              value: 10,
              type: "pdf",
              pdf: divariancePdf,
              kicker: "Research Paper",
              source: "Research Paper",
              description: "A novel metric connecting distributional difference measures for improved feature selection in embedding classification.",
              abstract: "A novel metric connecting distributional difference measures for improved feature selection in embedding classification.",
              url: divariancePdf,
              links: [
                {
                  label: "Open PDF",
                  href: divariancePdf
                }
              ]
            },
            {
              name: "Volatility Mitigation Toolkit",
              title: "Volatility Mitigation Toolkit",
              value: 10,
              type: "pdf",
              pdf: volatilityToolkitPdf,
              kicker: "Toolkit",
              source: "Toolkit",
              description: "Strategies and tools for managing and mitigating volatility in data-driven systems.",
              abstract: "Strategies and tools for managing and mitigating volatility in data-driven systems.",
              url: volatilityToolkitPdf,
              links: [
                {
                  label: "Open PDF",
                  href: volatilityToolkitPdf
                }
              ]
            }
          ]
        },
        {
          name: "Systems & Tooling",
          value: 16,
          description: "Practical build notes, teardown posts, and toolkits.",
          children: [
            
            /* ,{
              name: "Automation Notes",
              value: 6,
              description: "Practical build notes, teardown posts, and tools."
             }*/
          ]
        },
        {
          name: "Publications",
          value: 16,
          description: "External articles, essays, and publication-ready writing.",
          children: [
            {
              name: "Pairwise Cross-Variance Classification",
              title: "Pairwise Cross-Variance Classification",
              value: 10,
              type: "website",
              kicker: "Towards Data Science",
              source: "Towards Data Science",
              description: "Multi-class zero-shot embedding classification using a novel dimensionality reduction technique. Improved text/image agreement from 61% to 89%.",
              abstract: "Multi-class zero-shot embedding classification using a novel dimensionality reduction technique. Improved text/image agreement from 61% to 89%.",
              url: "https://towardsdatascience.com/pairwise-cross-variance-classification/",
              previewImage: "/assets/site-previews/pairwise-cross-variance-classification.png",
              links: [
                {
                  label: "Read article",
                  href: "https://towardsdatascience.com/pairwise-cross-variance-classification/"
                }
              ]
            },
            /* {
              name: "AI Strategy",
              value: 3,
              description: "Articles about business strategy and implementation."
            }, */
            {
              name: "Orthogonal Wonder Substack",
              value: 3,
              description: "Point-of-view writing and founder perspective.",
              type: "website",
              kicker: "Substack",
              source: "Substack",
              url: "https://orthogonalwonder.substack.com/",
              previewImage: "/assets/site-previews/orthogonal-wonder-substack.png",
              links: [
                {
                  label: "Read articles",
                  href: "https://orthogonalwonder.substack.com/"
                }
              ]
            }
          ]
        },
        /* {
          name: "Article Ideas",
          value: 8,
          description: "Future article categories and reusable resource ideas.",
          children: [
            {
              name: "Resource Library",
              value: 8,
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
        }*/
      ]
    },
    {
      name: "Contact Me",
      value: 30,
      color: "#c7ad72",
      description: "Need AI knowledge tools now? Reach out or schedule a call.",
      children: [
        {
          name: "Email",
          value: 8,
          template: "contact",
          kicker: "Primary channel",
          description: "Reach out directly by email.",
          links: [
            {
              label: "info@knowledgealgorithms.com",
              href: "mailto:info@knowledgealgorithms.com"
            }
          ]
        },
        {
          name: "Schedule a Call",
          value: 9,
          template: "schedule",
          description: "Suggest three times and describe what you need help with.",
          email: "info@knowledgealgorithms.com"
        },
        {
          name: "GitHub",
          value: 7,
          template: "contact",
          kicker: "Code / prototypes",
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
          template: "contact",
          kicker: "Professional profile",
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

export const siteData = applyContentItems(baseSiteData, generatedContentItems);