document.addEventListener('DOMContentLoaded', function() {
    const codeUploadForm = document.getElementById('code-upload-form');
    const codeFileInput = document.getElementById('code-file');
    const scanStatus = document.getElementById('scan-status');
    const resultsEmpty = document.getElementById('results-empty');
    const resultsContent = document.getElementById('results-content');
    const scanSummary = document.getElementById('scan-summary');
    const banditIssuesList = document.getElementById('bandit-issues-list');
    const semgrepIssuesList = document.getElementById('semgrep-issues-list');
    const downloadReportBtn = document.getElementById('download-report');
    
    let currentScanId = null;
    
    // Handle form submission
    codeUploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!codeFileInput.files || codeFileInput.files.length === 0) {
            alert('Please select a Python file to scan.');
            return;
        }
        
        const file = codeFileInput.files[0];
        if (!file.name.endsWith('.py')) {
            alert('Only Python (.py) files are allowed.');
            return;
        }
        
        // Create a FormData object
        const formData = new FormData();
        formData.append('file', file);
        
        // Show loading state
        scanStatus.classList.remove('d-none');
        resultsEmpty.classList.add('d-none');
        resultsContent.classList.add('d-none');
        
        // Send the file for scanning
        fetch('/bug_scanner/scan', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentScanId = data.scan_id;
                // Get the scan results
                getResults(data.scan_id);
            } else {
                scanStatus.classList.add('d-none');
                resultsEmpty.classList.remove('d-none');
                alert(`Error: ${data.error}`);
            }
        })
        .catch(error => {
            scanStatus.classList.add('d-none');
            resultsEmpty.classList.remove('d-none');
            console.error('Error:', error);
            alert('An error occurred during the scan. Please try again.');
        });
    });
    
    // Function to get scan results
    function getResults(scanId) {
        fetch(`/bug_scanner/report/${scanId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Update UI with results
                    displayResults(data.report);
                } else {
                    scanStatus.classList.add('d-none');
                    resultsEmpty.classList.remove('d-none');
                    alert(`Error: ${data.error}`);
                }
            })
            .catch(error => {
                scanStatus.classList.add('d-none');
                resultsEmpty.classList.remove('d-none');
                console.error('Error:', error);
                alert('An error occurred while retrieving the results. Please try again.');
            });
    }
    
    // Function to display scan results
    function displayResults(report) {
        scanStatus.classList.add('d-none');
        resultsEmpty.classList.add('d-none');
        resultsContent.classList.remove('d-none');
        
        // Update summary
        const banditResults = report.bandit_results || {};
        const banditIssues = getBanditIssues(banditResults);
        
        const semgrepResults = report.semgrep_results || {};
        const semgrepIssues = getSemgrepIssues(semgrepResults);
        
        const totalIssues = banditIssues.length + semgrepIssues.length;
        scanSummary.innerHTML = `
            <div class="alert ${totalIssues > 0 ? 'alert-warning' : 'alert-success'}">
                <h6 class="alert-heading">
                    ${totalIssues > 0 ? 
                        `<i class="fas fa-exclamation-triangle me-1"></i> Found ${totalIssues} issues` : 
                        '<i class="fas fa-check-circle me-1"></i> No issues found'}
                </h6>
                <p class="mb-0">
                    Analyzed file: <strong>${report.filename}</strong><br>
                    Bandit issues: <strong>${banditIssues.length}</strong><br>
                    Semgrep issues: <strong>${semgrepIssues.length}</strong>
                </p>
            </div>
        `;
        
        // Display Bandit issues
        if (banditIssues.length > 0) {
            let banditHtml = '<div class="list-group">';
            banditIssues.forEach(issue => {
                const severityClass = getSeverityClass(issue.issue_severity);
                banditHtml += `
                    <div class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">
                                <span class="badge ${severityClass} me-2">${issue.issue_severity}</span>
                                ${issue.issue_text}
                            </h6>
                            <small>Line: ${issue.line_number}</small>
                        </div>
                        <p class="mb-1"><code>${issue.code || 'No code available'}</code></p>
                        <small class="text-muted">
                            <strong>Confidence:</strong> ${issue.issue_confidence} |
                            <strong>Test ID:</strong> ${issue.test_id || 'N/A'}
                        </small>
                    </div>
                `;
            });
            banditHtml += '</div>';
            banditIssuesList.innerHTML = banditHtml;
        } else {
            banditIssuesList.innerHTML = '<div class="alert alert-success">No issues found with Bandit</div>';
        }
        
        // Display Semgrep issues
        if (semgrepIssues.length > 0) {
            let semgrepHtml = '<div class="list-group">';
            semgrepIssues.forEach(issue => {
                const severityClass = getSeverityClass(issue.severity);
                semgrepHtml += `
                    <div class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">
                                <span class="badge ${severityClass} me-2">${issue.severity}</span>
                                ${issue.message}
                            </h6>
                            <small>Line: ${issue.start?.line || 'N/A'}</small>
                        </div>
                        <p class="mb-1"><code>${issue.extra?.lines || 'No code available'}</code></p>
                        <small class="text-muted">
                            <strong>Rule ID:</strong> ${issue.check_id || 'N/A'}
                        </small>
                    </div>
                `;
            });
            semgrepHtml += '</div>';
            semgrepIssuesList.innerHTML = semgrepHtml;
        } else {
            semgrepIssuesList.innerHTML = '<div class="alert alert-success">No issues found with Semgrep</div>';
        }
        
        // Enable download button
        downloadReportBtn.disabled = false;
        downloadReportBtn.addEventListener('click', function() {
            downloadReport(currentScanId);
        });
    }
    
    // Helper function to get severity class
    function getSeverityClass(severity) {
        severity = (severity || '').toLowerCase();
        switch (severity) {
            case 'high':
            case 'error':
                return 'bg-danger';
            case 'medium':
            case 'warning':
                return 'bg-warning';
            case 'low':
            case 'info':
                return 'bg-info';
            default:
                return 'bg-secondary';
        }
    }
    
    // Helper function to extract Bandit issues
    function getBanditIssues(banditResults) {
        if (!banditResults.results) {
            return [];
        }
        return banditResults.results || [];
    }
    
    // Helper function to extract Semgrep issues
    function getSemgrepIssues(semgrepResults) {
        if (!semgrepResults.results) {
            return [];
        }
        return semgrepResults.results || [];
    }
    
    // Function to download the report
    function downloadReport(scanId) {
        window.location.href = `/bug_scanner/download/${scanId}`;
    }
});
