import { useEffect, useState } from "react";
import { EditorPage } from "./EditorPage.jsx";
import { StartPage } from "./StartPage.jsx";

// Hash routes keep the editor a static site: #/ (start) and #/edit/{draftId}.
function readRoute() {
  const m = window.location.hash.match(/^#\/edit\/([\w-]+)$/);
  return m ? { page: "edit", draftId: m[1] } : { page: "start" };
}

export function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route.page === "edit") return <EditorPage key={route.draftId} draftId={route.draftId} />;
  return <StartPage />;
}
