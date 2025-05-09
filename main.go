package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Task represents a task in the tracker
type Task struct {
	ID          string     `json:"id"`
	Text        string     `json:"text"`
	CreatedAt   time.Time  `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	Cycle       string     `json:"cycle"`
	Subtasks    []*Task    `json:"subtasks,omitempty"`
}

// TaskStore manages task storage and operations
type TaskStore struct {
	Tasks  []*Task `json:"tasks"`
	mutex  sync.RWMutex
	dbPath string
}

// NewTaskStore creates a new task store
func NewTaskStore(dbPath string) (*TaskStore, error) {
	store := &TaskStore{
		Tasks:  []*Task{},
		dbPath: dbPath,
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Try to load existing tasks
	if _, err := os.Stat(dbPath); err == nil {
		data, err := os.ReadFile(dbPath)
		if err != nil {
			return nil, err
		}

		if len(data) > 0 {
			var storedData struct {
				Tasks []*Task `json:"tasks"`
			}
			if err := json.Unmarshal(data, &storedData); err != nil {
				// If the file exists but is not valid JSON or doesn't have the expected structure,
				// start with an empty task list
				log.Printf("Error parsing existing tasks file: %v. Starting with empty task list.", err)
			} else {
				store.Tasks = storedData.Tasks
			}
		}
	}

	// Save to ensure the file exists with proper structure
	if err := store.Save(); err != nil {
		return nil, err
	}

	return store, nil
}

// Save saves the tasks to the JSON file
func (ts *TaskStore) Save() error {
	data, err := json.MarshalIndent(map[string]interface{}{
		"tasks": ts.Tasks,
	}, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(ts.dbPath, data, 0644)
}

// AddTask adds a new task
func (ts *TaskStore) AddTask(text, cycle string) (*Task, error) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	task := &Task{
		ID:        uuid.New().String(),
		Text:      text,
		CreatedAt: time.Now(),
		Cycle:     cycle,
	}

	ts.Tasks = append(ts.Tasks, task)

	if err := ts.Save(); err != nil {
		return nil, err
	}

	return task, nil
}

// GetAllTasks returns all tasks
func (ts *TaskStore) GetAllTasks() []*Task {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()

	// Return a copy to prevent concurrent modification
	tasksCopy := make([]*Task, len(ts.Tasks))
	copy(tasksCopy, ts.Tasks)

	return tasksCopy
}

// UpdateTaskStatus toggles task completion status
func (ts *TaskStore) UpdateTaskStatus(id string, complete bool) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	for _, task := range ts.Tasks {
		if task.ID == id {
			if complete {
				now := time.Now()
				task.CompletedAt = &now
			} else {
				task.CompletedAt = nil
			}
			return ts.Save()
		}
	}

	return fmt.Errorf("task not found")
}

// DeleteTask removes a task
func (ts *TaskStore) DeleteTask(id string) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	for i, task := range ts.Tasks {
		if task.ID == id {
			ts.Tasks = append(ts.Tasks[:i], ts.Tasks[i+1:]...)
			return ts.Save()
		}
	}

	return fmt.Errorf("task not found")
}

// AddSubtask adds a subtask to a parent task
func (ts *TaskStore) AddSubtask(parentID, text, cycle string) (*Task, error) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	subtask := &Task{
		ID:        uuid.New().String(),
		Text:      text,
		CreatedAt: time.Now(),
		Cycle:     cycle,
	}

	// Find parent task
	found := false
	for _, task := range ts.Tasks {
		if task.ID == parentID {
			if task.Subtasks == nil {
				task.Subtasks = []*Task{}
			}
			task.Subtasks = append(task.Subtasks, subtask)
			found = true
			break
		}
	}

	if !found {
		return nil, fmt.Errorf("parent task not found")
	}

	if err := ts.Save(); err != nil {
		return nil, err
	}

	return subtask, nil
}

// API handlers
func handleTasks(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.Method {
		case http.MethodGet:
			// List all tasks
			tasks := store.GetAllTasks()
			json.NewEncoder(w).Encode(tasks)

		case http.MethodPost:
			// Add a new task
			var data struct {
				Text  string `json:"text"`
				Cycle string `json:"cycle"`
			}

			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request format"})
				return
			}

			if data.Text == "" {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Task text cannot be empty"})
				return
			}

			task, err := store.AddTask(data.Text, data.Cycle)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}

			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(task)

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
			json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		}
	}
}

func handleTaskOperations(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Extract task ID from path
		path := strings.TrimPrefix(r.URL.Path, "/api/tasks/")
		parts := strings.Split(path, "/")

		if len(parts) < 1 || parts[0] == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Invalid task ID"})
			return
		}

		taskID := parts[0]

		// Handle different operations
		if len(parts) == 1 && r.Method == http.MethodDelete {
			// Delete task
			if err := store.DeleteTask(taskID); err != nil {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}

			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "Task deleted"})
			return
		}

		if len(parts) == 2 && parts[1] == "status" && r.Method == http.MethodPatch {
			// Update task status
			var data struct {
				Complete bool `json:"complete"`
			}

			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request format"})
				return
			}

			if err := store.UpdateTaskStatus(taskID, data.Complete); err != nil {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}

			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "Task updated"})
			return
		}

		if len(parts) == 2 && parts[1] == "subtask" && r.Method == http.MethodPost {
			// Add subtask
			var data struct {
				Text  string `json:"text"`
				Cycle string `json:"cycle"`
			}

			if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request format"})
				return
			}

			if data.Text == "" {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Subtask text cannot be empty"})
				return
			}

			subtask, err := store.AddSubtask(taskID, data.Text, data.Cycle)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}

			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(subtask)
			return
		}

		// If we get here, the operation is not supported
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
	}
}

func main() {
	log.Println("Starting task tracker API...")

	// Create a task store
	store, err := NewTaskStore("data/tasks.json")
	if err != nil {
		log.Fatalf("Failed to create task store: %v", err)
	}

	// Set up routes
	http.HandleFunc("/api/tasks", handleTasks(store))
	http.HandleFunc("/api/tasks/", handleTaskOperations(store))

	// Start the server
	log.Println("Server listening on port 8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
