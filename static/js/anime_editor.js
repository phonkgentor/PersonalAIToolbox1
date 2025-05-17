document.addEventListener('DOMContentLoaded', function() {
    // Phase 1: Scene Detection
    const sceneDetectionForm = document.getElementById('scene-detection-form');
    const animeVideoInput = document.getElementById('anime-video');
    const sceneJobProgress = document.getElementById('scene-job-progress');
    const sceneCurrentStep = document.getElementById('scene-current-step');
    const sceneProgressBar = document.getElementById('scene-progress-bar');
    const sceneErrorMessage = document.getElementById('scene-error-message');
    
    // Phase 2: Scene Selection
    const phase1 = document.getElementById('phase-1');
    const phase2 = document.getElementById('phase-2');
    const phase3 = document.getElementById('phase-3');
    const scenesContainer = document.getElementById('scenes-container');
    const backToUploadButton = document.getElementById('back-to-upload');
    const createEditedVideoButton = document.getElementById('create-edited-video');
    const editYoutubeUrlInput = document.getElementById('edit-youtube-url');
    const editJobProgress = document.getElementById('edit-job-progress');
    const editCurrentStep = document.getElementById('edit-current-step');
    const editProgressBar = document.getElementById('edit-progress-bar');
    const editErrorMessage = document.getElementById('edit-error-message');
    
    // Phase 3: Results
    const downloadEditedVideoButton = document.getElementById('download-edited-video');
    const startNewEditButton = document.getElementById('start-new-edit');
    
    let currentJobId = null;
    let pollingInterval = null;
    let selectedScenes = [];
    
    // Handle scene detection form submission
    sceneDetectionForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!animeVideoInput.files || animeVideoInput.files.length === 0) {
            alert('Please select a video file.');
            return;
        }
        
        const videoFile = animeVideoInput.files[0];
        
        // Create a FormData object
        const formData = new FormData();
        formData.append('video', videoFile);
        
        // Show loading state
        sceneJobProgress.classList.remove('d-none');
        sceneErrorMessage.classList.add('d-none');
        sceneCurrentStep.textContent = 'Starting scene detection...';
        sceneProgressBar.style.width = '0%';
        
        // Send the request
        fetch('/anime_editor/detect_scenes', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentJobId = data.job_id;
                // Start polling for status updates
                startSceneStatusPolling(currentJobId);
            } else {
                showSceneError(data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showSceneError('An error occurred while starting scene detection. Please try again.');
        });
    });
    
    // Function to start polling for scene detection status
    function startSceneStatusPolling(jobId) {
        // Clear any existing polling
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        pollingInterval = setInterval(() => {
            fetch(`/anime_editor/status/${jobId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateSceneStatus(data.job);
                    } else {
                        showSceneError(data.error);
                        clearInterval(pollingInterval);
                    }
                })
                .catch(error => {
                    console.error('Error polling status:', error);
                    showSceneError('Failed to get status updates. Please refresh the page and try again.');
                    clearInterval(pollingInterval);
                });
        }, 2000); // Poll every 2 seconds
    }
    
    // Function to update scene detection status
    function updateSceneStatus(job) {
        sceneCurrentStep.textContent = job.current_step || 'Processing...';
        sceneProgressBar.style.width = `${job.progress || 0}%`;
        
        // Check if job is complete or has error
        if (job.status === 'scenes_detected') {
            clearInterval(pollingInterval);
            
            // Move to phase 2 (scene selection)
            setTimeout(() => {
                phase1.classList.add('d-none');
                phase2.classList.remove('d-none');
                
                // Populate scenes
                populateScenes(job.results.scenes);
            }, 1000);
        } else if (job.status === 'error') {
            clearInterval(pollingInterval);
            showSceneError(job.error || 'An error occurred during scene detection.');
        }
    }
    
    // Function to populate detected scenes
    function populateScenes(scenes) {
        scenesContainer.innerHTML = '';
        selectedScenes = [];
        
        if (!scenes || scenes.length === 0) {
            scenesContainer.innerHTML = '<div class="col-12"><div class="alert alert-warning">No scenes detected. Please try with a different video.</div></div>';
            return;
        }
        
        scenes.forEach(scene => {
            const sceneCard = document.createElement('div');
            sceneCard.className = 'col-md-3 mb-3';
            
            // Format duration
            const duration = window.formatTimestamp(scene.duration);
            const startTime = window.formatTimestamp(scene.start_time);
            const endTime = window.formatTimestamp(scene.end_time);
            
            sceneCard.innerHTML = `
                <div class="card scene-card" data-scene-id="${scene.id}">
                    <img src="/anime_editor/thumbnail/${currentJobId}/${scene.id}" class="card-img-top" alt="Scene thumbnail">
                    <div class="card-body">
                        <h6 class="card-title">Scene ${scene.id + 1}</h6>
                        <p class="card-text small">
                            Duration: ${duration}<br>
                            Range: ${startTime} - ${endTime}
                        </p>
                        <div class="form-check">
                            <input class="form-check-input scene-checkbox" type="checkbox" value="${scene.id}" id="scene-${scene.id}">
                            <label class="form-check-label" for="scene-${scene.id}">
                                Select this scene
                            </label>
                        </div>
                    </div>
                </div>
            `;
            
            scenesContainer.appendChild(sceneCard);
        });
        
        // Add event listeners to scene checkboxes
        document.querySelectorAll('.scene-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    selectedScenes.push(parseInt(this.value));
                } else {
                    selectedScenes = selectedScenes.filter(id => id !== parseInt(this.value));
                }
                
                // Update UI to show which scenes are selected
                updateSelectedScenesUI();
            });
        });
    }
    
    // Function to update the UI to show which scenes are selected
    function updateSelectedScenesUI() {
        document.querySelectorAll('.scene-card').forEach(card => {
            const sceneId = parseInt(card.dataset.sceneId);
            if (selectedScenes.includes(sceneId)) {
                card.classList.add('border-primary');
            } else {
                card.classList.remove('border-primary');
            }
        });
        
        // Enable/disable create button based on selection
        createEditedVideoButton.disabled = selectedScenes.length === 0;
    }
    
    // Handle back button click
    backToUploadButton.addEventListener('click', function() {
        phase2.classList.add('d-none');
        phase1.classList.remove('d-none');
        
        // Reset form
        sceneDetectionForm.reset();
        sceneJobProgress.classList.add('d-none');
    });
    
    // Handle create edited video button click
    createEditedVideoButton.addEventListener('click', function() {
        if (selectedScenes.length === 0) {
            alert('Please select at least one scene.');
            return;
        }
        
        const youtubeUrl = editYoutubeUrlInput.value.trim();
        if (!youtubeUrl) {
            alert('Please enter a YouTube URL for the background music.');
            return;
        }
        
        // Show editing progress
        editJobProgress.classList.remove('d-none');
        editErrorMessage.classList.add('d-none');
        editCurrentStep.textContent = 'Starting video editing...';
        editProgressBar.style.width = '0%';
        
        // Send the request to create edited video
        fetch('/anime_editor/edit_video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                job_id: currentJobId,
                selected_scenes: selectedScenes,
                music_url: youtubeUrl
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Start polling for editing status
                startEditStatusPolling(data.job_id);
            } else {
                showEditError(data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showEditError('An error occurred while starting video editing. Please try again.');
        });
    });
    
    // Function to start polling for editing status
    function startEditStatusPolling(jobId) {
        // Clear any existing polling
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        pollingInterval = setInterval(() => {
            fetch(`/anime_editor/status/${jobId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        updateEditStatus(data.job);
                    } else {
                        showEditError(data.error);
                        clearInterval(pollingInterval);
                    }
                })
                .catch(error => {
                    console.error('Error polling edit status:', error);
                    showEditError('Failed to get status updates. Please refresh the page and try again.');
                    clearInterval(pollingInterval);
                });
        }, 2000); // Poll every 2 seconds
    }
    
    // Function to update editing status
    function updateEditStatus(job) {
        editCurrentStep.textContent = job.current_step || 'Processing...';
        editProgressBar.style.width = `${job.progress || 0}%`;
        
        // Check if job is complete or has error
        if (job.status === 'completed') {
            clearInterval(pollingInterval);
            
            // Move to phase 3 (results)
            setTimeout(() => {
                phase2.classList.add('d-none');
                phase3.classList.remove('d-none');
                
                // Set up download button
                downloadEditedVideoButton.onclick = () => {
                    window.location.href = `/anime_editor/download/${currentJobId}`;
                };
            }, 1000);
        } else if (job.status === 'error') {
            clearInterval(pollingInterval);
            showEditError(job.error || 'An error occurred during video editing.');
        }
    }
    
    // Handle start new edit button click
    startNewEditButton.addEventListener('click', function() {
        // Reset everything and go back to phase 1
        phase3.classList.add('d-none');
        phase1.classList.remove('d-none');
        
        // Reset forms
        sceneDetectionForm.reset();
        sceneJobProgress.classList.add('d-none');
        
        // Clear job ID and selected scenes
        currentJobId = null;
        selectedScenes = [];
    });
    
    // Helper functions for showing errors
    function showSceneError(message) {
        sceneErrorMessage.textContent = message;
        sceneErrorMessage.classList.remove('d-none');
        sceneProgressBar.classList.add('bg-danger');
    }
    
    function showEditError(message) {
        editErrorMessage.textContent = message;
        editErrorMessage.classList.remove('d-none');
        editProgressBar.classList.add('bg-danger');
    }
});
