import { TreeSite } from "@doc1000/treesite";
import "@doc1000/treesite/styles.css";
import { siteData } from "./siteData";

export default function App() {
  return <TreeSite siteData={siteData} />;
}
