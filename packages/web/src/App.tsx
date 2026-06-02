import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Dashboard } from "./pages/Dashboard.js";
import { TaskDetail } from "./pages/TaskDetail.js";
import { TaskCreate } from "./pages/TaskCreate.js";
import { ModelConfig } from "./pages/ModelConfig.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks/new" element={<TaskCreate />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/config/models" element={<ModelConfig />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
