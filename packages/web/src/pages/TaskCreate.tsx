import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { TaskCreateForm } from "../components/task/TaskCreateForm.js";

export function TaskCreate() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (config: any) => {
    setError(null);
    try {
      const { id } = await api.createTask(config);
      navigate(`/tasks/${id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create task");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Create New Task</h1>
      {error && (
        <div className="mb-4 px-3 py-2 bg-accent-red/10 border border-accent-red/30 rounded text-accent-red text-sm max-w-2xl">
          {error}
        </div>
      )}
      <TaskCreateForm onSubmit={handleSubmit} />
    </div>
  );
}
