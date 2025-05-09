package main

import (
	"encoding/json"
	"log"
	"net/http"
)

// Handle list all tasks
func handleListTasks(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		tasks := store.GetAllTasks()
		json.NewEncoder(w).Encode(tasks)
	}
}

// Handle add task
func handleAddTask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			Text  string `json:"text"`
			Cycle string `json:"cycle"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.Text == "" {
			http.Error(w, "Task text cannot be empty", http.StatusBadRequest)
			return
		}

		task, err := store.AddTask(data.Text, data.Cycle)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(task)
	}
}

// Handle delete task
func handleDeleteTask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			ID string `json:"id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.ID == "" {
			http.Error(w, "Task ID cannot be empty", http.StatusBadRequest)
			return
		}

		if err := store.DeleteTask(data.ID); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

// Handle complete task
func handleCompleteTask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			ID string `json:"id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.ID == "" {
			http.Error(w, "Task ID cannot be empty", http.StatusBadRequest)
			return
		}

		if err := store.UpdateTaskStatus(data.ID, true); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

// Handle add subtask
func handleAddSubtask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			ParentID string `json:"parentId"`
			Text     string `json:"text"`
			Cycle    string `json:"cycle"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.ParentID == "" {
			http.Error(w, "Parent task ID cannot be empty", http.StatusBadRequest)
			return
		}

		if data.Text == "" {
			http.Error(w, "Subtask text cannot be empty", http.StatusBadRequest)
			return
		}

		subtask, err := store.AddSubtask(data.ParentID, data.Text, data.Cycle)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(subtask)
	}
}

// Handle delete subtask
func handleDeleteSubtask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			ParentID string `json:"parentId"`
			ID       string `json:"id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.ParentID == "" {
			http.Error(w, "Parent task ID cannot be empty", http.StatusBadRequest)
			return
		}

		if data.ID == "" {
			http.Error(w, "Subtask ID cannot be empty", http.StatusBadRequest)
			return
		}

		if err := store.DeleteSubtask(data.ParentID, data.ID); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

// Handle complete subtask
func handleCompleteSubtask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			ParentID string `json:"parentId"`
			ID       string `json:"id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.ParentID == "" {
			http.Error(w, "Parent task ID cannot be empty", http.StatusBadRequest)
			return
		}

		if data.ID == "" {
			http.Error(w, "Subtask ID cannot be empty", http.StatusBadRequest)
			return
		}

		if err := store.UpdateSubtaskStatus(data.ParentID, data.ID, true); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func main() {
	log.Println("Starting deku task tracker...")

	// Create a task store
	store, err := NewTaskStore("data/tasks.json")
	if err != nil {
		log.Fatalf("Failed to create task store: %v", err)
	}

	// Set up API routes with simplified structure
	http.HandleFunc("/api/tasks", handleListTasks(store))
	http.HandleFunc("/api/task/add", handleAddTask(store))
	http.HandleFunc("/api/task/delete", handleDeleteTask(store))
	http.HandleFunc("/api/task/complete", handleCompleteTask(store))
	http.HandleFunc("/api/subtask/add", handleAddSubtask(store))
	http.HandleFunc("/api/subtask/delete", handleDeleteSubtask(store))
	http.HandleFunc("/api/subtask/complete", handleCompleteSubtask(store))

	// Serve static files
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Serve HTML templates
	http.HandleFunc("/", serveTemplate("templates/home.html"))
	http.HandleFunc("/kanban", serveTemplate("templates/kanban.html"))
	http.HandleFunc("/gantt", serveTemplate("templates/gantt.html"))
	http.HandleFunc("/calendar", serveTemplate("templates/calendar.html"))

	// Start the server
	log.Println("Server listening on port 8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// Helper function to serve HTML templates
func serveTemplate(templatePath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, templatePath)
	}
}
