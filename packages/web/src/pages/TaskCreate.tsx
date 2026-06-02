import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { TaskCreateForm } from "../components/task/TaskCreateForm.js";

export function TaskCreate() {
  const navigate = useNavigate();

  const handleSubmit = async (config: any) => {
    const { id } = await api.createTask(config);
    navigate(`/tasks/${id}`);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Create New Task</h1>
      <TaskCreateForm onSubmit={handleSubmit} />
    </div>
  );
}
