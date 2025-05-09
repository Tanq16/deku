package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

//go:embed templates static
var content embed.FS

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
		Tasks:  make([]*Task, 0),
		dbPath: dbPath,
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %v", err)
	}

	// Load existing tasks if file exists
	if _, err := os.Stat(dbPath); err == nil {
		data, err := os.ReadFile(dbPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read file: %v", err)
		}

		if len(data) > 0 {
			if err := json.Unmarshal(data, &store); err != nil {
				return nil, fmt.Errorf("failed to unmarshal JSON: %v", err)
			}
		}
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("error checking file: %v", err)
	} else {
		// Create an empty file
		if err := store.Save(); err != nil {
			return nil, fmt.Errorf("failed to create initial file: %v", err)
		}
		log.Printf("Created new task store at %s", dbPath)
	}

	return store, nil
}

// Save saves the tasks to the JSON file
func (ts *TaskStore) Save() error {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()

	data, err := json.MarshalIndent(ts, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %v", err)
	}

	if err := os.WriteFile(ts.dbPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write file: %v", err)
	}

	log.Printf("Saved %d tasks to %s", len(ts.Tasks), ts.dbPath)
	return nil
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
	err := ts.Save()
	if err != nil {
		return nil, fmt.Errorf("failed to save task: %v", err)
	}

	log.Printf("Added new task: %s, ID: %s, Cycle: %s", text, task.ID, cycle)
	return task, nil
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
				task.Subtasks = make([]*Task, 0)
			}
			task.Subtasks = append(task.Subtasks, subtask)
			found = true
			break
		}
	}

	if !found {
		return nil, fmt.Errorf("parent task not found: %s", parentID)
	}

	err := ts.Save()
	if err != nil {
		return nil, fmt.Errorf("failed to save subtask: %v", err)
	}

	log.Printf("Added new subtask: %s to parent %s", text, parentID)
	return subtask, nil
}

// UpdateTaskStatus toggles task completion status
func (ts *TaskStore) UpdateTaskStatus(id string, complete bool) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	// Search in main tasks
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

		// Check subtasks
		if task.Subtasks != nil {
			for _, subtask := range task.Subtasks {
				if subtask.ID == id {
					if complete {
						now := time.Now()
						subtask.CompletedAt = &now
					} else {
						subtask.CompletedAt = nil
					}

					// Check if all subtasks are complete to auto-complete parent
					allComplete := true
					for _, st := range task.Subtasks {
						if st.CompletedAt == nil {
							allComplete = false
							break
						}
					}

					if allComplete {
						now := time.Now()
						task.CompletedAt = &now
					} else {
						task.CompletedAt = nil
					}

					return ts.Save()
				}
			}
		}
	}

	return fmt.Errorf("task not found: %s", id)
}

// DeleteTask removes a task
func (ts *TaskStore) DeleteTask(id string) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	// Delete from main tasks
	for i, task := range ts.Tasks {
		if task.ID == id {
			ts.Tasks = append(ts.Tasks[:i], ts.Tasks[i+1:]...)
			return ts.Save()
		}

		// Check subtasks
		if task.Subtasks != nil {
			for i, subtask := range task.Subtasks {
				if subtask.ID == id {
					task.Subtasks = append(task.Subtasks[:i], task.Subtasks[i+1:]...)
					return ts.Save()
				}
			}
		}
	}

	return fmt.Errorf("task not found: %s", id)
}

// GetAllTasks returns all tasks sorted by completion status and creation time
func (ts *TaskStore) GetAllTasks() []*Task {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()

	// Create a copy of tasks to sort
	tasksCopy := make([]*Task, len(ts.Tasks))
	copy(tasksCopy, ts.Tasks)

	// Sort tasks: incomplete first, then by creation time (newest at bottom)
	sort.SliceStable(tasksCopy, func(i, j int) bool {
		// If one is complete and the other isn't, incomplete comes first
		if (tasksCopy[i].CompletedAt == nil) != (tasksCopy[j].CompletedAt == nil) {
			return tasksCopy[i].CompletedAt == nil
		}
		// Otherwise sort by creation time (older first)
		return tasksCopy[i].CreatedAt.Before(tasksCopy[j].CreatedAt)
	})

	return tasksCopy
}

// App is the main application struct
type App struct {
	Templates *template.Template
	Store     *TaskStore
}

func main() {
	// Initialize logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting Deku Task Tracker...")

	dbPath := "data/tasks.json"
	log.Printf("Using database path: %s", dbPath)

	store, err := NewTaskStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize task store: %v", err)
	}

	// Parse templates
	templates, err := template.ParseFS(content, "templates/*.html")
	if err != nil {
		log.Fatalf("Failed to parse templates: %v", err)
	}

	app := &App{
		Templates: templates,
		Store:     store,
	}

	// Static file server
	http.Handle("/static/", http.FileServer(http.FS(content)))

	// Page routes
	http.HandleFunc("/", app.HandleHome)
	http.HandleFunc("/kanban", app.HandleKanban)
	http.HandleFunc("/gantt", app.HandleGantt)
	http.HandleFunc("/calendar", app.HandleCalendar)

	// API routes
	http.HandleFunc("/api/tasks", app.HandleTasks)
	http.HandleFunc("/api/tasks/", app.HandleTaskOperations)

	// Start server
	port := ":8080"
	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(port, nil))
}

// HandleHome renders the home page
func (app *App) HandleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	app.Templates.ExecuteTemplate(w, "home.html", nil)
}

// HandleKanban renders the kanban page
func (app *App) HandleKanban(w http.ResponseWriter, r *http.Request) {
	app.Templates.ExecuteTemplate(w, "kanban.html", nil)
}

// HandleGantt renders the gantt page
func (app *App) HandleGantt(w http.ResponseWriter, r *http.Request) {
	app.Templates.ExecuteTemplate(w, "gantt.html", nil)
}

// HandleCalendar renders the calendar page
func (app *App) HandleCalendar(w http.ResponseWriter, r *http.Request) {
	app.Templates.ExecuteTemplate(w, "calendar.html", nil)
}

// HandleTasks handles GET (list all tasks) and POST (add new task) for /api/tasks
func (app *App) HandleTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		log.Println("GET /api/tasks - Fetching all tasks")
		tasks := app.Store.GetAllTasks()
		jsonResponse(w, tasks)

	case http.MethodPost:
		log.Println("POST /api/tasks - Adding new task")

		// Read the request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("Error reading request body: %v", err)
			http.Error(w, "Error reading request", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		log.Printf("Request body: %s", string(body))

		var requestData struct {
			Text  string `json:"text"`
			Cycle string `json:"cycle"`
		}

		if err := json.Unmarshal(body, &requestData); err != nil {
			log.Printf("Error parsing JSON: %v", err)
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		log.Printf("Adding task: Text=%s, Cycle=%s", requestData.Text, requestData.Cycle)

		task, err := app.Store.AddTask(requestData.Text, requestData.Cycle)
		if err != nil {
			log.Printf("Error adding task: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		jsonResponse(w, task)

	default:
		log.Printf("Method not allowed: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// HandleTaskOperations handles operations on specific tasks
func (app *App) HandleTaskOperations(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/tasks/")
	parts := strings.Split(path, "/")

	log.Printf("Task operation: %s %s", r.Method, r.URL.Path)

	if len(parts) < 1 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	taskID := parts[0]

	// Handle different operations based on URL and method
	if len(parts) == 1 {
		// /api/tasks/{id} - DELETE
		if r.Method == http.MethodDelete {
			log.Printf("DELETE /api/tasks/%s", taskID)
			if err := app.Store.DeleteTask(taskID); err != nil {
				log.Printf("Error deleting task: %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
			return
		}
	} else if len(parts) == 2 {
		if parts[1] == "subtask" && r.Method == http.MethodPost {
			// /api/tasks/{id}/subtask - POST
			log.Printf("POST /api/tasks/%s/subtask", taskID)

			body, err := io.ReadAll(r.Body)
			if err != nil {
				log.Printf("Error reading request body: %v", err)
				http.Error(w, "Error reading request", http.StatusBadRequest)
				return
			}
			defer r.Body.Close()

			log.Printf("Subtask request body: %s", string(body))

			var requestData struct {
				Text  string `json:"text"`
				Cycle string `json:"cycle"`
			}

			if err := json.Unmarshal(body, &requestData); err != nil {
				log.Printf("Error parsing subtask JSON: %v", err)
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}

			subtask, err := app.Store.AddSubtask(taskID, requestData.Text, requestData.Cycle)
			if err != nil {
				log.Printf("Error adding subtask: %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			jsonResponse(w, subtask)
			return
		} else if parts[1] == "status" && r.Method == http.MethodPatch {
			// /api/tasks/{id}/status - PATCH
			log.Printf("PATCH /api/tasks/%s/status", taskID)

			body, err := io.ReadAll(r.Body)
			if err != nil {
				log.Printf("Error reading request body: %v", err)
				http.Error(w, "Error reading request", http.StatusBadRequest)
				return
			}
			defer r.Body.Close()

			log.Printf("Status update request body: %s", string(body))

			var requestData struct {
				Complete bool `json:"complete"`
			}

			if err := json.Unmarshal(body, &requestData); err != nil {
				log.Printf("Error parsing status JSON: %v", err)
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}

			if err := app.Store.UpdateTaskStatus(taskID, requestData.Complete); err != nil {
				log.Printf("Error updating task status: %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			w.WriteHeader(http.StatusOK)
			return
		}
	}

	log.Printf("Method not allowed: %s %s", r.Method, r.URL.Path)
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

// Helper function to send JSON responses
func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")

	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("Error marshaling JSON response: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	log.Printf("Sending JSON response: %s", string(jsonData))
	w.Write(jsonData)
}
