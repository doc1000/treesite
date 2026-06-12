import { useEffect, useRef, useState } from "react";
import { isArtifactRelativePath, resolveArtifactLink, resolveArtifactUrl } from "./artifactUrls.js";

function deckTypeLabel(node) {
  if (!node || typeof node !== "object") return "Card";
  if (node.template === "schedule") return "Schedule";
  if (node.template === "contact") return "Contact";
  if (node.type === "pdf" || node.pdf) return "PDF";
  if (node.type === "htmlCard") return "HTML";
  if (node.type === "website") return "Site";
  if (node.type === "section") return "Section";
  return "Card";
}

export function MobileTileContent({ node, box }) {
  const title = node.title || node.name || "Untitled";
  const rawDesc = node.abstract || node.description;
  let descShort =
    typeof rawDesc === "string" ? rawDesc.replace(/\s+/g, " ").trim() : "";
  if (descShort.length > 220) descShort = `${descShort.slice(0, 217)}…`;

  const kickerPick =
    (typeof node.kicker === "string" && node.kicker.trim()) ||
    (typeof node.source === "string" &&
      node.source.trim() &&
      !node.source.startsWith("/")
      ? node.source.trim()
      : "") ||
    (typeof node.section === "string" && node.section.trim()) ||
    deckTypeLabel(node);

  const tight = box.h < 120;

  return (
    <div
      className={`tile-html tile-mobile${tight ? " tile-mobile--tight" : ""}`}
      xmlns="http://www.w3.org/1999/xhtml"
    >
      {kickerPick ? (
        <div className="tile-mobile__kicker">{kickerPick}</div>
      ) : null}
      <h3 className="tile-mobile__title">{title}</h3>
      {descShort ? (
        <p className="tile-mobile__desc">{descShort}</p>
      ) : null}
    </div>
  );
}

export function TileTemplate({
  node,
  box,
  labelPlacement = "top",
  suppressTileLabels = false,
  headerInMapOverlay = false,
  isMobile = false,
  artifactBase = "/artifact"
}) {
  if (isMobile) {
    return <MobileTileContent node={node} box={box} />;
  }

  const labelsAtBottom = labelPlacement === "bottom";
  const small = box.w < 170 || box.h < 110;
  const hasChildren = Boolean(node.children?.length);
  const rawLinks = hasChildren ? [] : node.links || (node.url ? [{ label: "Open", href: node.url }] : []);
  const links = rawLinks.map(link => resolveArtifactLink(artifactBase, link));
  const kicker = node.kicker || node.source || node.publication;
  const title = node.title || node.name;
  const description = node.abstract || node.description;
  const hasPdf = node.type === "pdf" || Boolean(node.pdf);
  const hasWebsite = node.type === "website" || node.type === "htmlCard";
  const hasRichContent = Boolean(
    hasPdf || hasWebsite || node.template || node.image || links.length || node.embed || node.html
  );

  // mapFace: "media" — show the preview image / image as the tile face.
  // Takes effect for all types including section nodes that inherited a preview.
  if (node.mapFace === "media") {
    return (
      <MediaFaceTile
        node={node}
        title={title}
        small={small}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
        artifactBase={artifactBase}
      />
    );
  }

  if (node.template === "schedule") {
    return (
      <ScheduleTile
        node={node}
        box={box}
        small={small}
        labelsAtBottom={labelsAtBottom}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
      />
    );
  }

  if (node.template === "contact") {
    return (
      <ContactTile
        node={node}
        small={small}
        labelsAtBottom={labelsAtBottom}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
      />
    );
  }

  if (node.type === "section") {
    return (
      <MinimalTile
        title={title}
        description={description}
        small={small}
        labelsAtBottom={labelsAtBottom}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
      />
    );
  }

  if (hasPdf) {
    return (
      <PdfTile
        node={node}
        title={title}
        description={description}
        small={small}
        labelsAtBottom={labelsAtBottom}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
        artifactBase={artifactBase}
      />
    );
  }

  if (hasWebsite) {
    return (
      <WebsiteTile
        node={node}
        title={title}
        description={description}
        small={small}
        labelsAtBottom={labelsAtBottom}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
        variant={node.type === "htmlCard" ? "htmlCard" : "website"}
        artifactBase={artifactBase}
      />
    );
  }

  if (!hasRichContent) {
    return (
      <MinimalTile
        title={title}
        description={description}
        small={small}
        labelsAtBottom={labelsAtBottom}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
      />
    );
  }

  const headerBlock = (
    <div>
      {kicker && <div className="tile-kicker">{kicker}</div>}
      <h3 className="tile-title">{title}</h3>
      <p className="tile-desc">{description}</p>
    </div>
  );

  const mediaBlocks = (
    <>
      {node.image && (
        <img className="tile-image" src={resolveArtifactUrl(artifactBase, node.image)} alt="" />
      )}

      {node.embed && (
        <iframe
          className="tile-embed"
          src={resolveArtifactUrl(artifactBase, node.embed)}
          title={title}
          loading="lazy"
        />
      )}

      {node.html && (
        <div
          className="tile-html-content"
          style={node.htmlFontSize ? { fontSize: node.htmlFontSize } : undefined}
          dangerouslySetInnerHTML={{ __html: node.html }}
        />
      )}
    </>
  );

  const linksBlock =
    links.length > 0 ? (
      <div className="tile-links">
        {links.slice(0, 3).map(link => (
          <TileLink key={link.href || link.label} link={link}>
            {link.label}
          </TileLink>
        ))}
      </div>
    ) : null;

  if (suppressTileLabels || headerInMapOverlay) {
    const hasVisualMedia = Boolean(node.image || node.embed || node.html);
    if (!hasVisualMedia) {
      return (
        <div
          className="tile-html tile-child-preview-hull"
          aria-hidden="true"
        />
      );
    }
    return (
      <div
        className={`tile-html tile-rich tile-visual-only ${
          small ? "tile-small" : ""
        }`}
      >
        <div className="tile-card">
          <div className="tile-rich-media">{mediaBlocks}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tile-html tile-rich ${small ? "tile-small" : ""} ${
        labelsAtBottom ? "tile-rich--labels-bottom" : ""
      }`}
    >
      <div className="tile-card">
        {labelsAtBottom ? (
          <>
            <div className="tile-rich-media">{mediaBlocks}</div>
            {headerBlock}
            {linksBlock}
          </>
        ) : (
          <>
            {headerBlock}
            {mediaBlocks}
            {linksBlock}
          </>
        )}
      </div>
    </div>
  );
}

function MinimalTile({ title, description, small, labelsAtBottom, suppressTileLabels, headerInMapOverlay }) {
  // Always show centered title + description — clean section panel.
  // The tile-child-preview-hull empty blank is removed; a dimmed text panel is
  // shown instead so the tile always conveys its identity.
  const dimmed = suppressTileLabels || headerInMapOverlay;
  return (
    <div
      className={`tile-html tile-minimal ${small ? "tile-small" : ""} ${
        labelsAtBottom ? "tile-minimal--labels-bottom" : ""
      } ${dimmed ? "tile-minimal--dimmed" : ""}`}
      aria-hidden={dimmed ? "true" : undefined}
    >
      <h3 className="tile-title">{title}</h3>
      {description && !dimmed && <p className="tile-desc">{description}</p>}
    </div>
  );
}

/**
 * MediaFaceTile — shows a preview image / background as the tile face.
 * Used when node.mapFace === "media". Falls back to MinimalTile if no image.
 */
function MediaFaceTile({
  node,
  title,
  small,
  suppressTileLabels,
  headerInMapOverlay,
  artifactBase
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const previewSrc = node.previewImage
    ? resolveArtifactUrl(artifactBase, node.previewImage)
    : node.image
      ? resolveArtifactUrl(artifactBase, node.image)
      : null;

  if (!previewSrc || imageFailed) {
    return (
      <MinimalTile
        title={title}
        description={node.abstract || node.description}
        small={small}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
      />
    );
  }

  const dimmed = suppressTileLabels || headerInMapOverlay;
  return (
    <div
      className={`tile-html tile-media-face ${small ? "tile-small" : ""} ${dimmed ? "tile-media-face--dimmed" : ""}`}
      aria-hidden={dimmed ? "true" : undefined}
    >
      <img
        className="tile-media-face__img"
        src={previewSrc}
        alt=""
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
      {!dimmed && (
        <div className="tile-media-face__overlay">
          <h3 className="tile-title">{title}</h3>
        </div>
      )}
    </div>
  );
}

function PdfTile({
  node,
  title,
  description,
  small,
  labelsAtBottom,
  suppressTileLabels,
  headerInMapOverlay,
  artifactBase = "/artifact"
}) {
  const canvasRef = useRef(null);
  const tileRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const pdfUrl = resolveArtifactUrl(artifactBase, node.pdf || node.url);
  const previewSrc = node.previewImage
    ? resolveArtifactUrl(artifactBase, node.previewImage)
    : null;
  const links = (node.links || (pdfUrl ? [{ label: "Open PDF", href: node.pdf || node.url }] : [])).map(
    link => resolveArtifactLink(artifactBase, link)
  );

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile || previewSrc) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" }
    );

    observer.observe(tile);
    return () => observer.disconnect();
  }, [previewSrc]);

  useEffect(() => {
    if (!isVisible || previewSrc || !pdfUrl || !canvasRef.current) return;

    let cancelled = false;
    let renderTask;
    const canvas = canvasRef.current;

    async function renderPreview() {
      try {
        const [{ getDocument, GlobalWorkerOptions }, { default: pdfWorkerUrl }] =
          await Promise.all([
            import("pdfjs-dist"),
            import("pdfjs-dist/build/pdf.worker.mjs?url")
          ]);

        GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        const pdf = await getDocument(pdfUrl).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = Math.max(220, Math.min(560, canvas.clientWidth || 360));
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch {
        if (!cancelled) setRenderFailed(true);
      }
    }

    renderPreview();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [isVisible, previewSrc, pdfUrl]);

  const visualOnly = Boolean(suppressTileLabels);
  const hideTextChrome = visualOnly || headerInMapOverlay;

  return (
    <div
      ref={tileRef}
      className={`tile-html pdf-tile ${visualOnly ? "tile-visual-only" : ""} ${small ? "tile-small" : ""} ${
        labelsAtBottom ? "pdf-tile--labels-bottom" : ""
      } ${renderFailed && !hideTextChrome ? "pdf-fallback" : ""}`}
    >
      {renderFailed ? (
        hideTextChrome ? (
          <div className="pdf-preview pdf-preview--empty" aria-hidden="true" />
        ) : (
          <div className="pdf-fallback-body">
            <div className="pdf-icon" aria-hidden="true">PDF</div>
            <h3 className="tile-title">{title}</h3>
            {description && <p className="tile-desc">{description}</p>}
          </div>
        )
      ) : (
        <>
          {previewSrc ? (
            <img className="pdf-preview" src={previewSrc} alt="" loading="lazy" />
          ) : (
            <canvas ref={canvasRef} className="pdf-preview" aria-hidden="true" />
          )}

          {!hideTextChrome && (
            <div className="pdf-overlay">
              <div className="tile-kicker">{node.kicker || node.source || "PDF"}</div>
              <h3 className="tile-title">{title}</h3>
              {description && <p className="tile-desc">{description}</p>}
            </div>
          )}
        </>
      )}

      {!hideTextChrome && links.length > 0 && (
        <div className="pdf-actions">
          {links.slice(0, 2).map(link => (
            <TileLink key={link.href || link.label} link={link}>
              {link.label}
            </TileLink>
          ))}
        </div>
      )}
    </div>
  );
}

function WebsiteTile({
  node,
  title,
  description,
  small,
  labelsAtBottom,
  suppressTileLabels,
  headerInMapOverlay,
  variant = "website",
  artifactBase = "/artifact"
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const openHref = node.url || node.source;
  const defaultLinkLabel = variant === "htmlCard" ? "Open page" : "Open site";
  const links = (node.links || (openHref ? [{ label: defaultLinkLabel, href: openHref }] : [])).map(
    link => resolveArtifactLink(artifactBase, link)
  );
  const previewSrc = node.previewImage
    ? resolveArtifactUrl(artifactBase, node.previewImage)
    : null;
  const hasLocalPreview =
    previewSrc &&
    (previewSrc.startsWith("/") ||
      previewSrc.startsWith("http") ||
      isArtifactRelativePath(node.previewImage));
  const visualOnly = Boolean(suppressTileLabels);
  const hideTextChrome = visualOnly || headerInMapOverlay;
  const fallbackKicker =
    variant === "htmlCard" ? "HTML" : node.source || "Website";

  if (!hasLocalPreview || imageFailed) {
    return (
      <MinimalTile
        title={title}
        description={description}
        small={small}
        labelsAtBottom={labelsAtBottom}
        suppressTileLabels={suppressTileLabels}
        headerInMapOverlay={headerInMapOverlay}
      />
    );
  }

  return (
    <div
      className={`tile-html preview-tile website-tile${variant === "htmlCard" ? " html-card-tile" : ""} ${
        visualOnly ? "tile-visual-only" : ""
      } ${small ? "tile-small" : ""} ${labelsAtBottom ? "preview-tile--labels-bottom" : ""}`}
    >
      <img
        className="site-preview"
        src={previewSrc}
        alt=""
        loading="lazy"
        onError={() => setImageFailed(true)}
      />

      {!hideTextChrome && (
        <div className="preview-overlay">
          <div className="tile-kicker">{node.kicker || fallbackKicker}</div>
          <h3 className="tile-title">{title}</h3>
          {description && <p className="tile-desc">{description}</p>}
        </div>
      )}

      {!hideTextChrome && links.length > 0 && (
        <div className="preview-actions">
          {links.slice(0, 2).map(link => (
            <TileLink key={link.href || link.label} link={link}>
              {link.label}
            </TileLink>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleTile({ node, box, small, labelsAtBottom, suppressTileLabels, headerInMapOverlay }) {
  const [name, setName] = useState("");
  const [needs, setNeeds] = useState("");
  const [times, setTimes] = useState(["", "", ""]);
  const showForm = box.w >= 280 && box.h >= 280;

  if (suppressTileLabels) {
    return (
      <div
        className="tile-html tile-child-preview-hull"
        aria-hidden="true"
      />
    );
  }
  const body = encodeURIComponent(
    `Name: ${name}

Preferred times:
1. ${times[0]}
2. ${times[1]}
3. ${times[2]}

What I need help with:
${needs}`
  );
  const href = `mailto:${node.email}?subject=${encodeURIComponent(
    "Schedule a call"
  )}&body=${body}`;

  if (!showForm) {
    const header = (
      <div>
        <div className="tile-kicker">Contact</div>
        <h3 className="tile-title">Schedule a Call</h3>
        <p className="tile-desc">{node.description}</p>
      </div>
    );
    const previewLinks = (
      <div className="tile-links">
        <span className="tile-link tile-link-preview">Open scheduler</span>
      </div>
    );

    return (
      <div
        className={`tile-html schedule-tile ${small ? "tile-small" : ""} ${
          labelsAtBottom ? "schedule-tile--labels-bottom" : ""
        }`}
      >
        <div className="tile-card">
          {headerInMapOverlay ? (
            previewLinks
          ) : labelsAtBottom ? (
            <>
              {previewLinks}
              {header}
            </>
          ) : (
            <>
              {header}
              {previewLinks}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tile-html schedule-tile ${small ? "tile-small" : ""} ${
        labelsAtBottom ? "schedule-tile--labels-bottom" : ""
      }`}
    >
      <div className="tile-card schedule-card">
        {!headerInMapOverlay && (
          <h3 className="tile-title">Schedule a Call</h3>
        )}

        <input
          placeholder="Your name"
          value={name}
          onClick={e => e.stopPropagation()}
          onChange={e => setName(e.target.value)}
        />

        {times.map((time, i) => (
          <input
            key={i}
            placeholder={`Preferred time ${i + 1}`}
            value={time}
            onClick={e => e.stopPropagation()}
            onChange={e => {
              const next = [...times];
              next[i] = e.target.value;
              setTimes(next);
            }}
          />
        ))}

        <textarea
          placeholder="Briefly describe your needs"
          value={needs}
          onClick={e => e.stopPropagation()}
          onChange={e => setNeeds(e.target.value)}
        />

        <a className="tile-link" href={href} onClick={e => e.stopPropagation()}>
          Open email
        </a>
      </div>
    </div>
  );
}

function ContactTile({ node, small, labelsAtBottom, suppressTileLabels, headerInMapOverlay }) {
  if (suppressTileLabels) {
    return (
      <div
        className="tile-html tile-child-preview-hull"
        aria-hidden="true"
      />
    );
  }
  const links = node.children?.length ? [] : node.links || [];

  const body = (
    <div>
      <div className="tile-kicker">Contact</div>
      <h3 className="tile-title">{node.name}</h3>
      <p className="tile-desc">
        {node.description || "Need AI knowledge tools now? Reach out."}
      </p>
    </div>
  );

  const linksBlock =
    links.length > 0 ? (
      <div className="tile-links">
        {links.map(link => (
          <TileLink key={link.href} link={link}>
            {link.label}
          </TileLink>
        ))}
      </div>
    ) : null;

  if (headerInMapOverlay) {
    return (
      <div
        className={`tile-html contact-tile ${small ? "tile-small" : ""} ${
          labelsAtBottom ? "contact-tile--labels-bottom" : ""
        }`}
      >
        <div className="tile-card">
          {linksBlock || (
            <div className="contact-tile-grow" aria-hidden="true" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tile-html contact-tile ${small ? "tile-small" : ""} ${
        labelsAtBottom ? "contact-tile--labels-bottom" : ""
      }`}
    >
      <div className="tile-card">
        {labelsAtBottom ? (
          <>
            {linksBlock || (
              <div className="contact-tile-grow" aria-hidden="true" />
            )}
            {body}
          </>
        ) : (
          <>
            {body}
            {linksBlock}
          </>
        )}
      </div>
    </div>
  );
}

function TileLink({ link, children }) {
  const isMailto = link.href?.startsWith("mailto:");

  return (
    <a
      className="tile-link"
      href={link.href}
      target={isMailto ? undefined : "_blank"}
      rel={isMailto ? undefined : "noreferrer"}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </a>
  );
}
