import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Command,
  Copy,
  ExternalLink,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  Link2,
  List,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  UploadCloud,
  X,
  Sun,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const starterLinks = [];

const categories = ["All links", "Inspiration", "Recipes", "Work", "Projects", "Practice", "Keys", "Tracker", "Read later", "Watch later", "Listen"];
const fallbackImage = "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=85";
const photoDbName = "saved-links-photos";
const photoStoreName = "photos";

function getStoredLinks() {
  try {
    const stored = localStorage.getItem("saved-links-vault");
    return stored ? JSON.parse(stored) : starterLinks;
  } catch {
    return starterLinks;
  }
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(photoDbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(photoStoreName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storePhoto(key, dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const db = await openPhotoDb();
  await new Promise((resolve, reject) => {
    const request = db.transaction(photoStoreName, "readwrite").objectStore(photoStoreName).put(blob, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

async function readPhoto(key) {
  const db = await openPhotoDb();
  const blob = await new Promise((resolve, reject) => {
    const request = db.transaction(photoStoreName, "readonly").objectStore(photoStoreName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob ? URL.createObjectURL(blob) : null;
}

function withoutLocalPhotos(items) {
  return items.map((item) => ({ ...item, image: item.image.startsWith("data:") ? fallbackImage : item.image }));
}

function persistLinks(items) {
  try {
    localStorage.setItem("saved-links-vault", JSON.stringify(items));
    return { items, usedFallback: false };
  } catch (error) {
    const compactItems = withoutLocalPhotos(items);
    try {
      localStorage.setItem("saved-links-vault", JSON.stringify(compactItems));
      return { items: compactItems, usedFallback: true };
    } catch {
      localStorage.removeItem("saved-links-vault");
      for (let end = compactItems.length; end > 0; end -= 1) {
        try {
          const recentItems = compactItems.slice(0, end);
          localStorage.setItem("saved-links-vault", JSON.stringify(recentItems));
          return { items: recentItems, usedFallback: true };
        } catch {
          // Try one fewer item until the browser accepts the payload.
        }
      }
      console.warn("Saved links could not be persisted.", error);
      return { items, usedFallback: true };
    }
  }
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read this image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Unable to read this image."));
      image.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.72));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [links, setLinks] = useState(getStoredLinks);
  const [activeCategory, setActiveCategory] = useState("All links");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("grid");
  const [copiedId, setCopiedId] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [originalImage, setOriginalImage] = useState("");
  const [newLink, setNewLink] = useState({ title: "", url: "", category: "Inspiration", description: "", image: "" });
  const [imageError, setImageError] = useState("");
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [draggedId, setDraggedId] = useState(null);
  const photoInputRef = useRef(null);

  useEffect(() => {
    const result = persistLinks(links);
    if (result.items !== links) setLinks(result.items);
    setStorageWarning(result.usedFallback ? "Your photo was optimized to fit local storage." : "");
  }, [links]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("search-input")?.focus();
      }
      if (event.key === "Escape") setIsAddOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredLinks = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return links.filter((link) => {
      const matchesCategory = activeCategory === "All links" || link.category === activeCategory;
      const matchesQuery =
        !normalized ||
        [link.title, link.description, link.domain, link.category].some((value) =>
          value.toLowerCase().includes(normalized)
        );
      return matchesCategory && matchesQuery;
    });
  }, [links, activeCategory, query]);

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = link.url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const openAddModal = () => {
    setEditingId(null);
    setOriginalImage("");
    setNewLink({ title: "", url: "", category: "Inspiration", description: "", image: "" });
    setImageError("");
    setIsAddOpen(true);
  };

  const openEditModal = (link) => {
    setEditingId(link.id);
    setOriginalImage(link.image);
    setNewLink({
      title: link.title,
      url: link.url,
      category: link.category,
      description: link.description,
      image: link.image.startsWith("idb:") ? "" : link.image,
    });
    setImageError("");
    setIsAddOpen(true);
  };

  const addLink = async (event) => {
    event.preventDefault();
    if (!newLink.title.trim() || !newLink.url.trim()) return;
    let domain = newLink.url;
    try {
      domain = new URL(newLink.url).hostname.replace("www.", "");
    } catch {
      // Keep the entered URL as a fallback label.
    }
    let image = newLink.image.trim() || originalImage || fallbackImage;
    if (image.startsWith("data:")) {
      const photoKey = `photo-${Date.now()}`;
      try {
        await storePhoto(photoKey, image);
        image = `idb:${photoKey}`;
      } catch {
        setImageError("This photo could not be saved. Please use an image link instead.");
        return;
      }
    }
    const newItem = {
      id: editingId ?? Date.now(),
      title: newLink.title.trim(),
      url: newLink.url.trim(),
      description: newLink.description.trim() || "A new corner of the internet worth keeping.",
      category: newLink.category,
      domain,
      image,
      accent: "cobalt",
    };
    setLinks((current) =>
      editingId === null
        ? [newItem, ...current]
        : current.map((item) => (item.id === editingId ? { ...item, ...newItem } : item))
    );
    setNewLink({ title: "", url: "", category: "Inspiration", description: "", image: "" });
    setEditingId(null);
    setOriginalImage("");
    setImageError("");
    setIsAddOpen(false);
  };

  const loadPhoto = (file) => {
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Please use an image smaller than 5 MB.");
      return;
    }
    compressPhoto(file)
      .then((image) => setNewLink((current) => ({ ...current, image })))
      .catch(() => setImageError("This image could not be processed. Try another file."));
  };

  const handlePhotoDrop = (event) => {
    event.preventDefault();
    setIsDraggingPhoto(false);
    const file = event.dataTransfer.files[0];
    if (file) loadPhoto(file);
  };

  const reorderLinks = (targetId) => {
    if (draggedId === null || draggedId === targetId) return;
    setLinks((current) => {
      const next = [...current];
      const fromIndex = next.findIndex((item) => item.id === draggedId);
      const toIndex = next.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDraggedId(null);
  };

  const totalCategories = new Set(links.map((link) => link.category)).size;

  return (
    <div className="vault-shell min-h-screen">
      <header className="vault-header">
        <div className="container flex items-center justify-between py-5">
          <a className="brand-lockup" href="#top" aria-label="Saved links home">
            <span className="brand-mark">
              <Bookmark size={16} strokeWidth={2.4} />
            </span>
            <span>
              saved links<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="header-actions">
            <span className="sync-status">
              <span className="sync-dot" /> saved locally
            </span>
            <button
              className="theme-toggle"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => toggleTheme?.()}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="container pb-20">
        <section className="intro-section">
          <div className="intro-copy">
            <div className="eyebrow">
              <Sparkles size={14} /> your little corner of the internet
            </div>
            <h1>
              Keep the good
              <br />
              <em>stuff</em> close.
            </h1>
            <p className="intro-description">
              A calm place for the links you want to come back to — the recipes, rabbit holes, and tiny sparks that
              make your days better.
            </p>
          </div>
          <div className="intro-note">
            <span className="note-kicker">a note to self</span>
            <span className="note-line" />
            <p>"The internet is better when you treat it like a garden, not a feed."</p>
            <span className="note-author">— from your future self</span>
          </div>
        </section>

        <section className="stats-strip" aria-label="Link vault stats">
          <div className="stat-item">
            <span className="stat-value">{links.length}</span>
            <span className="stat-label">things worth keeping</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{totalCategories}</span>
            <span className="stat-label">little collections</span>
          </div>
          <div className="stats-spacer" />
          <button className="add-button" onClick={openAddModal}>
            <Plus size={17} /> add a link
          </button>
        </section>
        {storageWarning && (
          <p className="storage-warning" role="status">
            {storageWarning}
          </p>
        )}

        <section className="library-section" aria-label="Your saved links">
          <div className="library-toolbar">
            <div className="section-title-wrap">
              <h2>All your good stuff</h2>
              <span className="count-badge">{filteredLinks.length}</span>
            </div>
            <div className="toolbar-controls">
              <label className="search-box" htmlFor="search-input">
                <Search size={17} />
                <input
                  id="search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your links..."
                />
                <kbd>
                  <Command size={11} /> K
                </kbd>
              </label>
              <div className="view-toggle" aria-label="Change view">
                <button
                  className={view === "grid" ? "selected" : ""}
                  aria-label="Grid view"
                  onClick={() => setView("grid")}
                >
                  <Grid2X2 size={16} />
                </button>
                <button
                  className={view === "list" ? "selected" : ""}
                  aria-label="List view"
                  onClick={() => setView("list")}
                >
                  <List size={17} />
                </button>
              </div>
            </div>
          </div>
          <div className="category-row">
            {categories.map((category) => (
              <button
                key={category}
                className={activeCategory === category ? "category-pill active" : "category-pill"}
                onClick={() => setActiveCategory(category)}
              >
                {category}
                {category === "All links" && <span>{links.length}</span>}
              </button>
            ))}
          </div>

          {filteredLinks.length > 0 ? (
            <div className={view === "grid" ? "link-grid" : "link-list"}>
              {filteredLinks.map((link, index) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  index={index}
                  view={view}
                  copiedId={copiedId}
                  onCopy={copyLink}
                  onVisit={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                  onEdit={() => openEditModal(link)}
                  onRemove={() => setLinks((current) => current.filter((item) => item.id !== link.id))}
                  onDragStart={() => setDraggedId(link.id)}
                  onDrop={() => reorderLinks(link.id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <FolderOpen size={22} />
              </div>
              <h3>Nothing here yet.</h3>
              <p>Try another search or start a new collection.</p>
              <button className="add-button" onClick={openAddModal}>
                <Plus size={16} /> add a link
              </button>
            </div>
          )}
        </section>
      </main>

      {isAddOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setIsAddOpen(false)}
        >
          <div className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <div className="modal-top">
              <div>
                <span className="eyebrow">{editingId === null ? "new bookmark" : "edit bookmark"}</span>
                <h2 id="add-title">{editingId === null ? "Save something good." : "Make it even better."}</h2>
              </div>
              <button className="close-button" aria-label="Close" onClick={() => setIsAddOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={addLink}>
              <label>
                Title
                <input
                  autoFocus
                  required
                  value={newLink.title}
                  onChange={(event) => setNewLink({ ...newLink, title: event.target.value })}
                  placeholder="What are you saving?"
                />
              </label>
              <label>
                URL
                <input
                  required
                  type="url"
                  value={newLink.url}
                  onChange={(event) => setNewLink({ ...newLink, url: event.target.value })}
                  placeholder="https://"
                />
              </label>
              <div
                className={`photo-dropzone ${isDraggingPhoto ? "dragging" : ""} ${
                  newLink.image || originalImage ? "has-photo" : ""
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDraggingPhoto(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDraggingPhoto(false)}
                onDrop={handlePhotoDrop}
                onClick={() => photoInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") photoInputRef.current?.click();
                }}
              >
                {newLink.image ? (
                  <img src={newLink.image} alt="Selected preview" />
                ) : originalImage ? (
                  <PhotoImage src={originalImage} alt="Current photo" />
                ) : (
                  <div className="photo-drop-copy">
                    <span className="photo-drop-icon">
                      <UploadCloud size={20} />
                    </span>
                    <span>
                      <strong>Drop a photo here</strong> or click to browse
                    </span>
                    <small>JPG, PNG, GIF, or WEBP · up to 5 MB</small>
                  </div>
                )}
                {(newLink.image || originalImage) && (
                  <span className="photo-change-hint">
                    <ImagePlus size={14} /> change photo
                  </span>
                )}
                <input
                  ref={photoInputRef}
                  className="photo-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) loadPhoto(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <label>
                Photo link <span className="optional">optional · paste an image URL instead</span>
                <input
                  type="url"
                  value={newLink.image.startsWith("data:") ? "" : newLink.image}
                  onChange={(event) => {
                    setImageError("");
                    setNewLink({ ...newLink, image: event.target.value });
                  }}
                  placeholder="https://images.example.com/photo.jpg"
                />
              </label>
              {imageError && (
                <p className="form-error" role="alert">
                  {imageError}
                </p>
              )}
              <div className="form-row">
                <label>
                  Collection
                  <select
                    value={newLink.category}
                    onChange={(event) => setNewLink({ ...newLink, category: event.target.value })}
                  >
                    {categories.slice(1).map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Note (optional)
                  <input
                    value={newLink.description}
                    onChange={(event) => setNewLink({ ...newLink, description: event.target.value })}
                    placeholder="Why keep it?"
                  />
                </label>
              </div>
              <button className="modal-submit" type="submit">
                <Link2 size={17} /> save link
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoImage({ src, alt, className }) {
  const [resolvedSrc, setResolvedSrc] = useState(src.startsWith("idb:") ? fallbackImage : src);

  useEffect(() => {
    if (!src.startsWith("idb:")) {
      setResolvedSrc(src);
      return;
    }
    let objectUrl = "";
    readPhoto(src.slice(4))
      .then((url) => {
        if (url) {
          objectUrl = url;
          setResolvedSrc(url);
        }
      })
      .catch(() => undefined);
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return <img src={resolvedSrc} alt={alt} className={className} />;
}

function LinkCard({ link, index, view, copiedId, onCopy, onVisit, onEdit, onRemove, onDragStart, onDrop }) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (view === "list") {
    return (
      <article
        className="link-list-card"
        draggable
        onDragStart={onDragStart}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        style={{ animationDelay: `${index * 35}ms` }}
      >
        <PhotoImage src={link.image} alt="" />
        <div className="list-card-main">
          <span className="card-category">{link.category}</span>
          <h3>{link.title}</h3>
          <p>{link.description}</p>
          <span className="card-domain">
            <span className="domain-favicon">{link.domain[0].toUpperCase()}</span>
            {link.domain}
          </span>
        </div>
        <div className="list-actions">
          <button className="copy-button" onClick={() => onCopy(link)}>
            {copiedId === link.id ? (
              <>
                <Check size={15} /> copied
              </>
            ) : (
              <>
                <Copy size={15} /> copy link
              </>
            )}
          </button>
          <button className="visit-button" onClick={onVisit}>
            <ExternalLink size={15} /> visit
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`link-card accent-${link.accent} ${index === 0 ? "featured-card" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="card-image-wrap">
        <PhotoImage className="card-image" src={link.image} alt="" />
        <div className="image-overlay" />
        <div className="card-topline">
          <span className="card-category">{link.category}</span>
          <div className="card-menu-wrap">
            <button
              className="card-menu"
              aria-label={`More options for ${link.title}`}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="card-menu-popover">
                <button
                  onClick={() => {
                    onEdit();
                    setMenuOpen(false);
                  }}
                >
                  Edit card
                </button>
                <button
                  onClick={() => {
                    onRemove();
                    setMenuOpen(false);
                  }}
                >
                  Remove link
                </button>
              </div>
            )}
          </div>
        </div>
        {link.pinned && (
          <span className="pinned-label">
            <Bookmark size={12} fill="currentColor" /> pinned
          </span>
        )}
      </div>
      <div className="card-content">
        <h3>{link.title}</h3>
        <p>{link.description}</p>
        <div className="card-footer">
          <span className="card-domain">
            <span className="domain-favicon">{link.domain[0].toUpperCase()}</span>
            {link.domain}
          </span>
          <div className="card-actions">
            <button className="round-action" aria-label="Copy link" onClick={() => onCopy(link)}>
              {copiedId === link.id ? <Check size={15} /> : <Copy size={15} />}
            </button>
            <button className="visit-button" onClick={onVisit}>
              visit <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
