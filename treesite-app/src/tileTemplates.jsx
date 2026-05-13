import { useEffect, useRef, useState } from "react";

export function TileTemplate({ node, box }) {
  const small = box.w < 170 || box.h < 110;
  const links = node.links || (node.url ? [{ label: "Open", href: node.url }] : []);
  const kicker = node.kicker || node.source || node.publication || "Section";
  const title = node.title || node.name;
  const description = node.abstract || node.description;
  const hasPdf = node.type === "pdf" || Boolean(node.pdf);
  const hasWebsite = node.type === "website";
  const hasRichContent = Boolean(
    hasPdf || hasWebsite || node.template || node.image || links.length || node.embed || node.html
  );

  if (node.template === "schedule") {
    return <ScheduleTile node={node} box={box} small={small} />;
  }

  if (node.template === "contact") {
    return <ContactTile node={node} small={small} />;
  }

  if (hasPdf) {
    return (
      <PdfTile
        node={node}
        title={title}
        description={description}
        small={small}
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
      />
    );
  }

  if (!hasRichContent) {
    return (
      <MinimalTile
        title={title}
        description={description}
        small={small}
      />
    );
  }

  return (
    <div className={`tile-html tile-rich ${small ? "tile-small" : ""}`}>
      <div className="tile-card">
        <div>
          <div className="tile-kicker">{kicker}</div>
          <h3 className="tile-title">{title}</h3>
          <p className="tile-desc">{description}</p>
        </div>

        {node.image && (
          <img className="tile-image" src={node.image} alt="" />
        )}

        {node.embed && (
          <iframe
            className="tile-embed"
            src={node.embed}
            title={title}
            loading="lazy"
          />
        )}

        {node.html && (
          <div
            className="tile-html-content"
            dangerouslySetInnerHTML={{ __html: node.html }}
          />
        )}

        {links.length > 0 && (
          <div className="tile-links">
            {links.slice(0, 3).map(link => (
              <TileLink key={link.href || link.label} link={link}>
                {link.label}
              </TileLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MinimalTile({ title, description, small }) {
  return (
    <div className={`tile-html tile-minimal ${small ? "tile-small" : ""}`}>
      <h3 className="tile-title">{title}</h3>
      {description && <p className="tile-desc">{description}</p>}
    </div>
  );
}

function PdfTile({ node, title, description, small }) {
  const canvasRef = useRef(null);
  const tileRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const pdfUrl = node.pdf || node.url;
  const links = node.links || (pdfUrl ? [{ label: "Open PDF", href: pdfUrl }] : []);

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile || node.previewImage) return;

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
  }, [node.previewImage]);

  useEffect(() => {
    if (!isVisible || node.previewImage || !pdfUrl || !canvasRef.current) return;

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
  }, [isVisible, node.previewImage, pdfUrl]);

  return (
    <div
      ref={tileRef}
      className={`tile-html pdf-tile ${small ? "tile-small" : ""} ${
        renderFailed ? "pdf-fallback" : ""
      }`}
    >
      {renderFailed ? (
        <div className="pdf-fallback-body">
          <div className="pdf-icon" aria-hidden="true">PDF</div>
          <h3 className="tile-title">{title}</h3>
          {description && <p className="tile-desc">{description}</p>}
        </div>
      ) : (
        <>
          {node.previewImage ? (
            <img className="pdf-preview" src={node.previewImage} alt="" loading="lazy" />
          ) : (
            <canvas ref={canvasRef} className="pdf-preview" aria-hidden="true" />
          )}

          <div className="pdf-overlay">
            <div className="tile-kicker">{node.kicker || node.source || "PDF"}</div>
            <h3 className="tile-title">{title}</h3>
            {description && <p className="tile-desc">{description}</p>}
          </div>
        </>
      )}

      {links.length > 0 && (
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

function WebsiteTile({ node, title, description, small }) {
  const [imageFailed, setImageFailed] = useState(false);
  const links = node.links || (node.url ? [{ label: "Open site", href: node.url }] : []);
  const hasLocalPreview = node.previewImage?.startsWith("/");

  if (!hasLocalPreview || imageFailed) {
    return (
      <MinimalTile
        title={title}
        description={description}
        small={small}
      />
    );
  }

  return (
    <div className={`tile-html preview-tile website-tile ${small ? "tile-small" : ""}`}>
      <img
        className="site-preview"
        src={node.previewImage}
        alt=""
        loading="lazy"
        onError={() => setImageFailed(true)}
      />

      <div className="preview-overlay">
        <div className="tile-kicker">{node.kicker || node.source || "Website"}</div>
        <h3 className="tile-title">{title}</h3>
        {description && <p className="tile-desc">{description}</p>}
      </div>

      {links.length > 0 && (
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

function ScheduleTile({ node, box, small }) {
  const [name, setName] = useState("");
  const [needs, setNeeds] = useState("");
  const [times, setTimes] = useState(["", "", ""]);
  const showForm = box.w >= 280 && box.h >= 280;
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
    return (
      <div className={`tile-html schedule-tile ${small ? "tile-small" : ""}`}>
        <div className="tile-card">
          <div>
            <div className="tile-kicker">Contact</div>
            <h3 className="tile-title">Schedule a Call</h3>
            <p className="tile-desc">{node.description}</p>
          </div>

          <div className="tile-links">
            <span className="tile-link tile-link-preview">Open scheduler</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`tile-html schedule-tile ${small ? "tile-small" : ""}`}>
      <div className="tile-card schedule-card">
        <h3 className="tile-title">Schedule a Call</h3>

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

function ContactTile({ node, small }) {
  return (
    <div className={`tile-html contact-tile ${small ? "tile-small" : ""}`}>
      <div className="tile-card">
        <div>
          <div className="tile-kicker">Contact</div>
          <h3 className="tile-title">{node.name}</h3>
          <p className="tile-desc">
            {node.description || "Need AI knowledge tools now? Reach out."}
          </p>
        </div>

        <div className="tile-links">
          {(node.links || []).map(link => (
            <TileLink key={link.href} link={link}>
              {link.label}
            </TileLink>
          ))}
        </div>
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