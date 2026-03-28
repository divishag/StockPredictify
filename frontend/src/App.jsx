import { ThemeProvider } from "./context/ThemeContext";
import WorkflowPage from "./pages/WorkflowPage";

export default function App() {
  return (
    <ThemeProvider>
      <WorkflowPage />
    </ThemeProvider>
  );
}
