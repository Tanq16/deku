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

type Task struct {
	ID          string        `json:"id"`
	Text        string        `json:"text"`
	CreatedAt   time.Time     `json:"createdAt"`
	CompletedAt time.Time     `json:"completedAt,omitempty"`
	Cycle       time.Duration `json:"cycle"`
	Subtasks    []*Task       `json:"subtasks,omitempty"`
}

type TaskStore struct {
	Tasks  []*Task `json:"tasks"`
	mutex  sync.RWMutex
	dbPath string
}

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
func (ts *TaskStore) AddTask(text string, cycle time.Duration) (*Task, error) {
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
				task.CompletedAt = time.Now()
			} else {
				task.CompletedAt = time.Time{}
			}
			return ts.Save()
		}
	}

	return fmt.Errorf("task not found")
}

// UpdateSubtaskStatus toggles subtask completion status
func (ts *TaskStore) UpdateSubtaskStatus(parentID, subtaskID string, complete bool) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	for _, task := range ts.Tasks {
		if task.ID == parentID {
			for _, subtask := range task.Subtasks {
				if subtask.ID == subtaskID {
					if complete {
						subtask.CompletedAt = time.Now()
					} else {
						subtask.CompletedAt = time.Time{}
					}
					return ts.Save()
				}
			}
			return fmt.Errorf("subtask not found")
		}
	}

	return fmt.Errorf("parent task not found")
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

// DeleteSubtask removes a subtask from a parent task
func (ts *TaskStore) DeleteSubtask(parentID, subtaskID string) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	for _, task := range ts.Tasks {
		if task.ID == parentID {
			for i, subtask := range task.Subtasks {
				if subtask.ID == subtaskID {
					task.Subtasks = append(task.Subtasks[:i], task.Subtasks[i+1:]...)
					return ts.Save()
				}
			}
			return fmt.Errorf("subtask not found")
		}
	}

	return fmt.Errorf("parent task not found")
}

// AddSubtask adds a subtask to a parent task
func (ts *TaskStore) AddSubtask(parentID, text string, cycle time.Duration) (*Task, error) {
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

// Handle list all tasks
func handleList(store *TaskStore) http.HandlerFunc {
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

// Handle add new task
func handleAddTask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var data struct {
			Text  string        `json:"text"`
			Cycle time.Duration `json:"cycle"`
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

// Handle add subtask
func handleAddSubtask(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract parent ID from path
		path := strings.TrimPrefix(r.URL.Path, "/add/")
		pathParts := strings.Split(path, "/")
		if len(pathParts) != 2 || pathParts[1] != "subtask" {
			http.Error(w, "Invalid URL format", http.StatusBadRequest)
			return
		}
		parentID := pathParts[0]

		var data struct {
			Text  string        `json:"text"`
			Cycle time.Duration `json:"cycle"`
		}

		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request format", http.StatusBadRequest)
			return
		}

		if data.Text == "" {
			http.Error(w, "Subtask text cannot be empty", http.StatusBadRequest)
			return
		}

		subtask, err := store.AddSubtask(parentID, data.Text, data.Cycle)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(subtask)
	}
}

// Handle delete task or subtask
func handleDelete(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract IDs from path
		path := strings.TrimPrefix(r.URL.Path, "/delete/")
		pathParts := strings.Split(path, "/")

		if len(pathParts) == 1 {
			// Delete task
			taskID := pathParts[0]

			if err := store.DeleteTask(taskID); err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
		} else if len(pathParts) == 2 {
			// Delete subtask
			parentID := pathParts[0]
			subtaskID := pathParts[1]

			if err := store.DeleteSubtask(parentID, subtaskID); err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
		} else {
			http.Error(w, "Invalid URL format", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

// Handle complete task or subtask
func handleComplete(store *TaskStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract IDs from path
		path := strings.TrimPrefix(r.URL.Path, "/complete/")
		pathParts := strings.Split(path, "/")

		var err error

		if len(pathParts) == 1 {
			// Complete task
			taskID := pathParts[0]
			err = store.UpdateTaskStatus(taskID, true)
		} else if len(pathParts) == 2 {
			// Complete subtask
			parentID := pathParts[0]
			subtaskID := pathParts[1]
			err = store.UpdateSubtaskStatus(parentID, subtaskID, true)
		} else {
			http.Error(w, "Invalid URL format", http.StatusBadRequest)
			return
		}

		if err != nil {
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

	// Set up simplified routes
	http.HandleFunc("/list", handleList(store))
	http.HandleFunc("/add", handleAddTask(store))
	http.HandleFunc("/add/", handleAddSubtask(store))
	http.HandleFunc("/delete/", handleDelete(store))
	http.HandleFunc("/complete/", handleComplete(store))

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
