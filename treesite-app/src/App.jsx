import TreeSite from "./TreeSite";
import { siteData, rootOrder } from "./siteData";
import "./treesite.css";
import "./contactTiles.css";

export default function App() {
  return <TreeSite siteData={siteData} rootOrder={rootOrder} />;
}