package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// CycleDurations maps cycle string values to time.Duration values
var CycleDurations = map[string]time.Duration{
	"5m":  5 * time.Minute,
	"1h":  1 * time.Hour,
	"4h":  4 * time.Hour,
	"12h": 12 * time.Hour,
	"1d":  24 * time.Hour,
	"3d":  72 * time.Hour,
	"1w":  7 * 24 * time.Hour,
	"1m":  30 * 24 * time.Hour,
	"3m":  90 * 24 * time.Hour,
	"":    0,
}

type Task struct {
	ID          string     `json:"id"`
	Text        string     `json:"text"`
	CreatedAt   time.Time  `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	Cycle       string     `json:"cycle"` // Keep the cycle value for frontend display
	DueAt       *time.Time `json:"dueAt,omitempty"`
	Subtasks    []*Task    `json:"subtasks,omitempty"`
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

// calculateDueAt calculates the due time based on the cycle string
func calculateDueAt(createdAt time.Time, cycle string) *time.Time {
	if cycle == "" {
		return nil // No due date for tasks without cycles
	}

	duration, exists := CycleDurations[cycle]
	if !exists {
		// Default to 1 day if cycle is not recognized
		duration = 24 * time.Hour
	}

	if duration == 0 {
		return nil
	}

	dueTime := createdAt.Add(duration)
	return &dueTime
}

// AddTask adds a new task
func (ts *TaskStore) AddTask(text string, cycle string) (*Task, error) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	createdAt := time.Now()
	dueAt := calculateDueAt(createdAt, cycle)

	task := &Task{
		ID:        uuid.New().String(),
		Text:      text,
		CreatedAt: createdAt,
		Cycle:     cycle,
		DueAt:     dueAt,
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

// UpdateSubtaskStatus toggles subtask completion status
func (ts *TaskStore) UpdateSubtaskStatus(parentID, subtaskID string, complete bool) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	for _, task := range ts.Tasks {
		if task.ID == parentID {
			for _, subtask := range task.Subtasks {
				if subtask.ID == subtaskID {
					if complete {
						now := time.Now()
						subtask.CompletedAt = &now
					} else {
						subtask.CompletedAt = nil
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
func (ts *TaskStore) AddSubtask(parentID, text string, cycle string) (*Task, error) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	createdAt := time.Now()
	dueAt := calculateDueAt(createdAt, cycle)

	subtask := &Task{
		ID:        uuid.New().String(),
		Text:      text,
		CreatedAt: createdAt,
		Cycle:     cycle,
		DueAt:     dueAt,
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
