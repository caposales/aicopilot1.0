#!/usr/bin/env python3
"""
Backend API Testing for ENT Solutions Voice AI Agent Platform
Tests all backend APIs including admin functionality
"""

import requests
import json
import os
import sys
from datetime import datetime

# Get base URL from environment or use default
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://restricted-panel.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

class APITester:
    def __init__(self):
        self.results = []
        self.auth_token = None
        self.admin_token = None
        self.user_data = None
        self.admin_data = None
        self.workspace_data = None
        self.agent_id = None
        
        # Admin credentials from test requirements
        self.admin_user = {
            "email": "admin@example.com",
            "password": "admin123"
        }
        
        # Regular user credentials from test requirements  
        self.regular_user = {
            "email": "user@test.com",
            "password": "user123"
        }
        
        # Test user for registration
        self.test_user = {
            "email": "sarah.johnson@techcorp.com",
            "password": "SecurePass123!",
            "name": "Sarah Johnson",
            "companyName": "TechCorp Solutions"
        }
        
    def log_result(self, test_name, status, details=""):
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        
        status_color = Colors.GREEN if status == "PASS" else Colors.RED
        print(f"[{status_color}{status}{Colors.ENDC}] {test_name}")
        if details:
            print(f"  {details}")
        
    def test_admin_login(self):
        """Test admin login with admin@example.com"""
        try:
            response = requests.post(f"{API_URL}/auth/login", 
                                   json=self.admin_user, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["token", "user", "workspace"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.admin_token = data["token"]
                    self.admin_data = data["user"]
                    self.log_result("Admin Login", "PASS", 
                                  f"Admin login successful: {data['user']['email']}")
                else:
                    self.log_result("Admin Login", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Admin Login", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Login", "FAIL", f"Connection error: {str(e)}")

    def test_regular_user_login(self):
        """Test regular user login with user@test.com"""
        try:
            response = requests.post(f"{API_URL}/auth/login", 
                                   json=self.regular_user, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["token", "user", "workspace"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.auth_token = data["token"]  # Store regular user token
                    self.user_data = data["user"]
                    self.log_result("Regular User Login", "PASS", 
                                  f"Regular user login successful: {data['user']['email']}")
                else:
                    self.log_result("Regular User Login", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Regular User Login", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Regular User Login", "FAIL", f"Connection error: {str(e)}")

    def test_admin_verify_endpoint(self):
        """Test GET /api/admin/verify - Admin access verification"""
        if not self.admin_token:
            self.log_result("Admin Verify Endpoint", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/verify", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("isAdmin"):
                    self.log_result("Admin Verify Endpoint", "PASS", 
                                  "Admin verification successful")
                else:
                    self.log_result("Admin Verify Endpoint", "FAIL", 
                                  "Admin flag not set correctly")
            else:
                self.log_result("Admin Verify Endpoint", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Verify Endpoint", "FAIL", f"Connection error: {str(e)}")

    def test_regular_user_admin_access_denied(self):
        """Test that regular user cannot access admin endpoints"""
        if not self.auth_token:
            self.log_result("Regular User Admin Access Denied", "FAIL", "No regular user token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{API_URL}/admin/verify", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 403:
                self.log_result("Regular User Admin Access Denied", "PASS", 
                              "Regular user correctly denied admin access")
            else:
                self.log_result("Regular User Admin Access Denied", "FAIL", 
                              f"Expected 403, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Regular User Admin Access Denied", "FAIL", f"Connection error: {str(e)}")

    def test_admin_stats_endpoint(self):
        """Test GET /api/admin/stats - Admin dashboard stats"""
        if not self.admin_token:
            self.log_result("Admin Stats Endpoint", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/stats", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["totalUsers", "totalWorkspaces", "totalAgents", "totalCalls", "totalPhoneNumbers", "totalErrors"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.log_result("Admin Stats Endpoint", "PASS", 
                                  f"Admin stats retrieved: {data['totalUsers']} users, {data['totalAgents']} agents")
                else:
                    self.log_result("Admin Stats Endpoint", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Admin Stats Endpoint", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Stats Endpoint", "FAIL", f"Connection error: {str(e)}")

    def test_admin_users_list(self):
        """Test GET /api/admin/users - List all users"""
        if not self.admin_token:
            self.log_result("Admin Users List", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/users", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "users" in data and isinstance(data["users"], list):
                    users = data["users"]
                    self.log_result("Admin Users List", "PASS", 
                                  f"Retrieved {len(users)} users")
                else:
                    self.log_result("Admin Users List", "FAIL", 
                                  "Invalid response format - missing users array")
            else:
                self.log_result("Admin Users List", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Users List", "FAIL", f"Connection error: {str(e)}")

    def test_admin_agents_list(self):
        """Test GET /api/admin/agents - List all agents"""
        if not self.admin_token:
            self.log_result("Admin Agents List", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/agents", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "agents" in data and isinstance(data["agents"], list):
                    agents = data["agents"]
                    self.log_result("Admin Agents List", "PASS", 
                                  f"Retrieved {len(agents)} agents")
                else:
                    self.log_result("Admin Agents List", "FAIL", 
                                  "Invalid response format - missing agents array")
            else:
                self.log_result("Admin Agents List", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Agents List", "FAIL", f"Connection error: {str(e)}")

    def test_admin_call_logs_list(self):
        """Test GET /api/admin/call-logs - List all call logs"""
        if not self.admin_token:
            self.log_result("Admin Call Logs List", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/call-logs", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "callLogs" in data and isinstance(data["callLogs"], list):
                    call_logs = data["callLogs"]
                    self.log_result("Admin Call Logs List", "PASS", 
                                  f"Retrieved {len(call_logs)} call logs")
                else:
                    self.log_result("Admin Call Logs List", "FAIL", 
                                  "Invalid response format - missing callLogs array")
            else:
                self.log_result("Admin Call Logs List", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Call Logs List", "FAIL", f"Connection error: {str(e)}")

    def test_admin_error_logs_list(self):
        """Test GET /api/admin/error-logs - List all error logs"""
        if not self.admin_token:
            self.log_result("Admin Error Logs List", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/error-logs", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "errorLogs" in data and isinstance(data["errorLogs"], list):
                    error_logs = data["errorLogs"]
                    self.log_result("Admin Error Logs List", "PASS", 
                                  f"Retrieved {len(error_logs)} error logs")
                else:
                    self.log_result("Admin Error Logs List", "FAIL", 
                                  "Invalid response format - missing errorLogs array")
            else:
                self.log_result("Admin Error Logs List", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Error Logs List", "FAIL", f"Connection error: {str(e)}")

    def test_admin_role_endpoint(self):
        """Test GET /api/admin/role - Get admin role and permissions"""
        if not self.admin_token:
            self.log_result("Admin Role Endpoint", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/role", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["role", "permissions", "isSuperAdmin"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.log_result("Admin Role Endpoint", "PASS", 
                                  f"Role: {data['role']}, Super Admin: {data['isSuperAdmin']}")
                else:
                    self.log_result("Admin Role Endpoint", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Admin Role Endpoint", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Role Endpoint", "FAIL", f"Connection error: {str(e)}")

    def test_admin_invite_endpoint(self):
        """Test POST /api/admin/invite - Send admin invite (mock)"""
        if not self.admin_token:
            self.log_result("Admin Invite Endpoint", "FAIL", "No admin token available")
            return
            
        try:
            invite_data = {
                "email": "test.moderator@example.com",
                "name": "Test Moderator",
                "role": "moderator"
            }
            
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.post(f"{API_URL}/admin/invite", 
                                   json=invite_data,
                                   headers=headers, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    self.log_result("Admin Invite Endpoint", "PASS", 
                                  f"Invite sent successfully (mock): {data.get('message', '')}")
                else:
                    self.log_result("Admin Invite Endpoint", "FAIL", 
                                  "Invite response incorrect")
            else:
                self.log_result("Admin Invite Endpoint", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Invite Endpoint", "FAIL", f"Connection error: {str(e)}")

    def test_admin_clients_list(self):
        """Test GET /api/admin/clients - List all clients/workspaces"""
        if not self.admin_token:
            self.log_result("Admin Clients List", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/clients", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "clients" in data and isinstance(data["clients"], list):
                    clients = data["clients"]
                    self.log_result("Admin Clients List", "PASS", 
                                  f"Retrieved {len(clients)} clients/workspaces")
                else:
                    self.log_result("Admin Clients List", "FAIL", 
                                  "Invalid response format - missing clients array")
            else:
                self.log_result("Admin Clients List", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Clients List", "FAIL", f"Connection error: {str(e)}")

    def test_admin_audit_logs(self):
        """Test GET /api/admin/audit-logs - Get audit logs"""
        if not self.admin_token:
            self.log_result("Admin Audit Logs", "FAIL", "No admin token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{API_URL}/admin/audit-logs?limit=50", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "auditLogs" in data and isinstance(data["auditLogs"], list):
                    audit_logs = data["auditLogs"]
                    self.log_result("Admin Audit Logs", "PASS", 
                                  f"Retrieved {len(audit_logs)} audit logs")
                else:
                    self.log_result("Admin Audit Logs", "FAIL", 
                                  "Invalid response format - missing auditLogs array")
            else:
                self.log_result("Admin Audit Logs", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Admin Audit Logs", "FAIL", f"Connection error: {str(e)}")

    def test_contacts_api(self):
        """Test contacts CRUD operations"""
        if not self.auth_token:
            self.log_result("Contacts API", "FAIL", "No auth token available")
            return
            
        try:
            # Test create contact
            contact_data = {
                "firstName": "John",
                "lastName": "Doe",
                "email": "john.doe@example.com",
                "phone": "+1234567890",
                "company": "Test Corp"
            }
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.post(f"{API_URL}/contacts", 
                                   json=contact_data,
                                   headers=headers, 
                                   timeout=10)
            
            if response.status_code == 201:
                contact = response.json()
                contact_id = contact.get("id")
                
                # Test list contacts
                list_response = requests.get(f"{API_URL}/contacts", 
                                           headers=headers, 
                                           timeout=10)
                
                if list_response.status_code == 200:
                    list_data = list_response.json()
                    if "contacts" in list_data:
                        self.log_result("Contacts API", "PASS", 
                                      f"Contact created and listed successfully. Total: {list_data.get('total', 0)}")
                    else:
                        self.log_result("Contacts API", "FAIL", 
                                      "Contact created but list failed")
                else:
                    self.log_result("Contacts API", "FAIL", 
                                  f"Contact created but list failed: {list_response.status_code}")
            else:
                self.log_result("Contacts API", "FAIL", 
                              f"Contact creation failed: {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Contacts API", "FAIL", f"Connection error: {str(e)}")

    def test_bulk_contacts_import(self):
        """Test bulk contacts import"""
        if not self.auth_token:
            self.log_result("Bulk Contacts Import", "FAIL", "No auth token available")
            return
            
        try:
            bulk_contacts = [
                {
                    "firstName": "Alice",
                    "lastName": "Smith",
                    "email": "alice@example.com",
                    "phone": "+1111111111",
                    "company": "Alpha Corp"
                },
                {
                    "firstName": "Bob",
                    "lastName": "Johnson",
                    "email": "bob@example.com",
                    "phone": "+2222222222",
                    "company": "Beta Inc"
                }
            ]
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.post(f"{API_URL}/contacts/bulk", 
                                   json={"contacts": bulk_contacts},
                                   headers=headers, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("imported") == 2:
                    self.log_result("Bulk Contacts Import", "PASS", 
                                  f"Successfully imported {data['imported']} contacts")
                else:
                    self.log_result("Bulk Contacts Import", "FAIL", 
                                  "Bulk import response incorrect")
            else:
                self.log_result("Bulk Contacts Import", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Bulk Contacts Import", "FAIL", f"Connection error: {str(e)}")

    def test_health_check(self):
        """Test GET /api/ - Health check endpoint"""
        try:
            response = requests.get(f"{API_URL}/", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                expected_fields = ["message", "version"]
                missing_fields = [field for field in expected_fields if field not in data]
                
                if not missing_fields and data.get("message") == "ENT Solutions API":
                    self.log_result("Health Check", "PASS", f"API responding: {data}")
                else:
                    self.log_result("Health Check", "FAIL", f"Unexpected response format: {data}")
            else:
                self.log_result("Health Check", "FAIL", f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Health Check", "FAIL", f"Connection error: {str(e)}")
    
    def test_user_registration(self):
        """Test POST /api/auth/register"""
        try:
            response = requests.post(f"{API_URL}/auth/register", 
                                   json=self.test_user, 
                                   timeout=10)
            
            if response.status_code == 201:
                data = response.json()
                required_fields = ["token", "user", "workspace"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.auth_token = data["token"]
                    self.user_data = data["user"]
                    self.workspace_data = data["workspace"]
                    self.log_result("User Registration", "PASS", 
                                  f"User created: {data['user']['email']}")
                else:
                    self.log_result("User Registration", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                # If user already exists, try to log in instead
                if response.status_code == 409:
                    self.log_result("User Registration", "PASS", 
                                  "User already exists (expected for repeated tests)")
                else:
                    self.log_result("User Registration", "FAIL", 
                                  f"Status {response.status_code}: {response.text}")
                    
        except requests.exceptions.RequestException as e:
            self.log_result("User Registration", "FAIL", f"Connection error: {str(e)}")
    
    def test_user_login(self):
        """Test POST /api/auth/login"""
        try:
            login_data = {
                "email": self.test_user["email"],
                "password": self.test_user["password"]
            }
            
            response = requests.post(f"{API_URL}/auth/login", 
                                   json=login_data, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["token", "user", "workspace"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.auth_token = data["token"]
                    self.user_data = data["user"]
                    self.workspace_data = data["workspace"]
                    self.log_result("User Login", "PASS", 
                                  f"Login successful: {data['user']['email']}")
                else:
                    self.log_result("User Login", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("User Login", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("User Login", "FAIL", f"Connection error: {str(e)}")
    
    def test_get_current_user(self):
        """Test GET /api/auth/me"""
        if not self.auth_token:
            self.log_result("Get Current User", "FAIL", "No auth token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{API_URL}/auth/me", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["user", "workspace"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.log_result("Get Current User", "PASS", 
                                  f"User data retrieved: {data['user']['email']}")
                else:
                    self.log_result("Get Current User", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Get Current User", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Get Current User", "FAIL", f"Connection error: {str(e)}")
    
    def test_voices_api(self):
        """Test GET /api/voices"""
        try:
            response = requests.get(f"{API_URL}/voices", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if "voices" in data and isinstance(data["voices"], list):
                    voices = data["voices"]
                    if len(voices) == 8:  # Expected 8 ElevenLabs voices
                        # Check voice structure
                        sample_voice = voices[0] if voices else {}
                        required_fields = ["id", "name", "description"]
                        missing_fields = [field for field in required_fields if field not in sample_voice]
                        
                        if not missing_fields:
                            self.log_result("Voices API", "PASS", 
                                          f"Retrieved {len(voices)} voices")
                        else:
                            self.log_result("Voices API", "FAIL", 
                                          f"Voice missing fields: {missing_fields}")
                    else:
                        self.log_result("Voices API", "FAIL", 
                                      f"Expected 8 voices, got {len(voices)}")
                else:
                    self.log_result("Voices API", "FAIL", 
                                  "Invalid response format - missing voices array")
            else:
                self.log_result("Voices API", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Voices API", "FAIL", f"Connection error: {str(e)}")
    
    def test_prompts_api(self):
        """Test GET /api/prompts"""
        try:
            response = requests.get(f"{API_URL}/prompts", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if "prompts" in data and isinstance(data["prompts"], list):
                    prompts = data["prompts"]
                    if len(prompts) == 5:  # Expected 5 pre-made prompts
                        # Check prompt structure
                        sample_prompt = prompts[0] if prompts else {}
                        required_fields = ["id", "name", "prompt"]
                        missing_fields = [field for field in required_fields if field not in sample_prompt]
                        
                        if not missing_fields:
                            self.log_result("Prompts API", "PASS", 
                                          f"Retrieved {len(prompts)} prompts")
                        else:
                            self.log_result("Prompts API", "FAIL", 
                                          f"Prompt missing fields: {missing_fields}")
                    else:
                        self.log_result("Prompts API", "FAIL", 
                                      f"Expected 5 prompts, got {len(prompts)}")
                else:
                    self.log_result("Prompts API", "FAIL", 
                                  "Invalid response format - missing prompts array")
            else:
                self.log_result("Prompts API", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Prompts API", "FAIL", f"Connection error: {str(e)}")
    
    def test_create_agent(self):
        """Test POST /api/agents"""
        if not self.auth_token:
            self.log_result("Create Agent", "FAIL", "No auth token available")
            return
            
        try:
            agent_data = {
                "name": "Customer Service Agent",
                "initialMessage": "Hello! I'm here to help with your questions.",
                "voiceId": "rachel",
                "language": "en-US",
                "interruptSensitivity": "high",
                "responseSpeed": "fast",
                "aiCreativity": 0.8,
                "callTransferEnabled": True,
                "callTransferNumber": "+1234567890"
            }
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.post(f"{API_URL}/agents", 
                                   json=agent_data,
                                   headers=headers, 
                                   timeout=10)
            
            if response.status_code == 201:
                data = response.json()
                required_fields = ["id", "name", "workspaceId"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.agent_id = data["id"]
                    self.log_result("Create Agent", "PASS", 
                                  f"Agent created: {data['name']} (ID: {data['id'][:8]}...)")
                else:
                    self.log_result("Create Agent", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Create Agent", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Create Agent", "FAIL", f"Connection error: {str(e)}")
    
    def test_list_agents(self):
        """Test GET /api/agents"""
        if not self.auth_token:
            self.log_result("List Agents", "FAIL", "No auth token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{API_URL}/agents", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if "agents" in data and isinstance(data["agents"], list):
                    agents = data["agents"]
                    self.log_result("List Agents", "PASS", 
                                  f"Retrieved {len(agents)} agents")
                else:
                    self.log_result("List Agents", "FAIL", 
                                  "Invalid response format - missing agents array")
            else:
                self.log_result("List Agents", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("List Agents", "FAIL", f"Connection error: {str(e)}")
    
    def test_get_agent(self):
        """Test GET /api/agents/{id}"""
        if not self.auth_token or not self.agent_id:
            self.log_result("Get Agent", "FAIL", "No auth token or agent ID available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{API_URL}/agents/{self.agent_id}", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["id", "name", "workspaceId"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.log_result("Get Agent", "PASS", 
                                  f"Retrieved agent: {data['name']}")
                else:
                    self.log_result("Get Agent", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Get Agent", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Get Agent", "FAIL", f"Connection error: {str(e)}")
    
    def test_update_agent(self):
        """Test PUT /api/agents/{id}"""
        if not self.auth_token or not self.agent_id:
            self.log_result("Update Agent", "FAIL", "No auth token or agent ID available")
            return
            
        try:
            update_data = {
                "name": "Updated Customer Service Agent",
                "aiCreativity": 0.5
            }
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.put(f"{API_URL}/agents/{self.agent_id}", 
                                  json=update_data,
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("name") == update_data["name"]:
                    self.log_result("Update Agent", "PASS", 
                                  f"Agent updated successfully")
                else:
                    self.log_result("Update Agent", "FAIL", 
                                  "Agent update did not reflect changes")
            else:
                self.log_result("Update Agent", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Update Agent", "FAIL", f"Connection error: {str(e)}")
    
    def test_get_integrations(self):
        """Test GET /api/integrations"""
        if not self.auth_token:
            self.log_result("Get Integrations", "FAIL", "No auth token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{API_URL}/integrations", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                expected_providers = ["twilio", "ghl", "calcom", "deepgram", "elevenlabs"]
                missing_providers = [p for p in expected_providers if p not in data]
                
                if not missing_providers:
                    self.log_result("Get Integrations", "PASS", 
                                  "All integration providers present")
                else:
                    self.log_result("Get Integrations", "FAIL", 
                                  f"Missing providers: {missing_providers}")
            else:
                self.log_result("Get Integrations", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Get Integrations", "FAIL", f"Connection error: {str(e)}")
    
    def test_twilio_integration(self):
        """Test POST /api/integrations/twilio"""
        if not self.auth_token:
            self.log_result("Twilio Integration", "FAIL", "No auth token available")
            return
            
        try:
            twilio_data = {
                "accountSid": "ACtest123456789",
                "authToken": "testtoken123456789"
            }
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.post(f"{API_URL}/integrations/twilio", 
                                   json=twilio_data,
                                   headers=headers, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("configured"):
                    self.log_result("Twilio Integration", "PASS", 
                                  "Twilio integration configured successfully")
                else:
                    self.log_result("Twilio Integration", "FAIL", 
                                  "Integration response incorrect")
            else:
                self.log_result("Twilio Integration", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Twilio Integration", "FAIL", f"Connection error: {str(e)}")
    
    def test_deepgram_integration(self):
        """Test POST /api/integrations/deepgram"""
        if not self.auth_token:
            self.log_result("Deepgram Integration", "FAIL", "No auth token available")
            return
            
        try:
            deepgram_data = {
                "apiKey": "dg_test123456789abcdef"
            }
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.post(f"{API_URL}/integrations/deepgram", 
                                   json=deepgram_data,
                                   headers=headers, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("configured"):
                    self.log_result("Deepgram Integration", "PASS", 
                                  "Deepgram integration configured successfully")
                else:
                    self.log_result("Deepgram Integration", "FAIL", 
                                  "Integration response incorrect")
            else:
                self.log_result("Deepgram Integration", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Deepgram Integration", "FAIL", f"Connection error: {str(e)}")
    
    def test_elevenlabs_integration(self):
        """Test POST /api/integrations/elevenlabs"""
        if not self.auth_token:
            self.log_result("ElevenLabs Integration", "FAIL", "No auth token available")
            return
            
        try:
            elevenlabs_data = {
                "apiKey": "el_test123456789abcdef"
            }
            
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.post(f"{API_URL}/integrations/elevenlabs", 
                                   json=elevenlabs_data,
                                   headers=headers, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("configured"):
                    self.log_result("ElevenLabs Integration", "PASS", 
                                  "ElevenLabs integration configured successfully")
                else:
                    self.log_result("ElevenLabs Integration", "FAIL", 
                                  "Integration response incorrect")
            else:
                self.log_result("ElevenLabs Integration", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("ElevenLabs Integration", "FAIL", f"Connection error: {str(e)}")
    
    def test_remove_twilio_integration(self):
        """Test DELETE /api/integrations/twilio"""
        if not self.auth_token:
            self.log_result("Remove Twilio Integration", "FAIL", "No auth token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.delete(f"{API_URL}/integrations/twilio", 
                                     headers=headers, 
                                     timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    self.log_result("Remove Twilio Integration", "PASS", 
                                  "Twilio integration removed successfully")
                else:
                    self.log_result("Remove Twilio Integration", "FAIL", 
                                  "Remove response incorrect")
            else:
                self.log_result("Remove Twilio Integration", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Remove Twilio Integration", "FAIL", f"Connection error: {str(e)}")
    
    def test_dashboard_stats(self):
        """Test GET /api/dashboard/stats"""
        if not self.auth_token:
            self.log_result("Dashboard Stats", "FAIL", "No auth token available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{API_URL}/dashboard/stats", 
                                  headers=headers, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["totalAgents", "totalCalls", "totalPhoneNumbers", "recentCalls"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.log_result("Dashboard Stats", "PASS", 
                                  f"Stats: {data['totalAgents']} agents, {data['totalCalls']} calls")
                else:
                    self.log_result("Dashboard Stats", "FAIL", 
                                  f"Missing fields: {missing_fields}")
            else:
                self.log_result("Dashboard Stats", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Dashboard Stats", "FAIL", f"Connection error: {str(e)}")
    
    def test_delete_agent(self):
        """Test DELETE /api/agents/{id}"""
        if not self.auth_token or not self.agent_id:
            self.log_result("Delete Agent", "FAIL", "No auth token or agent ID available")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.delete(f"{API_URL}/agents/{self.agent_id}", 
                                     headers=headers, 
                                     timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    self.log_result("Delete Agent", "PASS", 
                                  "Agent deleted successfully")
                else:
                    self.log_result("Delete Agent", "FAIL", 
                                  "Delete response incorrect")
            else:
                self.log_result("Delete Agent", "FAIL", 
                              f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_result("Delete Agent", "FAIL", f"Connection error: {str(e)}")
    
    def run_all_tests(self):
        """Run all API tests in sequence"""
        print(f"\n{Colors.BOLD}=== ENT Solutions Voice AI Agent Platform Backend API Tests ==={Colors.ENDC}")
        print(f"Testing API at: {API_URL}")
        print(f"Admin User: {self.admin_user['email']}")
        print(f"Regular User: {self.regular_user['email']}")
        print("-" * 50)
        
        # Health and public endpoints
        self.test_health_check()
        self.test_voices_api()
        self.test_prompts_api()
        
        # Auth flow - Admin and Regular Users
        print(f"\n{Colors.BLUE}=== Admin Authentication Tests ==={Colors.ENDC}")
        self.test_admin_login()
        self.test_regular_user_login()
        
        # Admin access verification
        print(f"\n{Colors.BLUE}=== Admin Access Control Tests ==={Colors.ENDC}")
        self.test_admin_verify_endpoint()
        self.test_regular_user_admin_access_denied()
        
        # Admin endpoints
        print(f"\n{Colors.BLUE}=== Admin Management Tests ==={Colors.ENDC}")
        self.test_admin_stats_endpoint()
        self.test_admin_role_endpoint()
        self.test_admin_users_list()
        self.test_admin_invite_endpoint()
        self.test_admin_clients_list()
        self.test_admin_audit_logs()
        self.test_admin_agents_list()
        self.test_admin_call_logs_list()
        self.test_admin_error_logs_list()
        
        # Regular user tests (using test user registration)
        print(f"\n{Colors.BLUE}=== Regular User API Tests ==={Colors.ENDC}")
        self.test_user_registration()
        self.test_user_login()
        self.test_get_current_user()
        
        # Agent CRUD (using regular user token)
        print(f"\n{Colors.BLUE}=== Agent Management Tests ==={Colors.ENDC}")
        self.test_create_agent()
        self.test_list_agents()
        self.test_get_agent()
        self.test_update_agent()
        
        # Integrations
        print(f"\n{Colors.BLUE}=== Integration Tests ==={Colors.ENDC}")
        self.test_get_integrations()
        self.test_twilio_integration()
        self.test_deepgram_integration()
        self.test_elevenlabs_integration()
        self.test_remove_twilio_integration()
        
        # Dashboard
        print(f"\n{Colors.BLUE}=== Dashboard Tests ==={Colors.ENDC}")
        self.test_dashboard_stats()
        
        # Cleanup
        print(f"\n{Colors.BLUE}=== Cleanup Tests ==={Colors.ENDC}")
        self.test_delete_agent()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test results summary"""
        print(f"\n{Colors.BOLD}=== Test Results Summary ==={Colors.ENDC}")
        print("-" * 50)
        
        passed = [r for r in self.results if r["status"] == "PASS"]
        failed = [r for r in self.results if r["status"] == "FAIL"]
        
        print(f"{Colors.GREEN}✓ Passed: {len(passed)}{Colors.ENDC}")
        print(f"{Colors.RED}✗ Failed: {len(failed)}{Colors.ENDC}")
        print(f"Total Tests: {len(self.results)}")
        
        if failed:
            print(f"\n{Colors.RED}Failed Tests:{Colors.ENDC}")
            for test in failed:
                print(f"  - {test['test']}: {test['details']}")
        
        success_rate = (len(passed) / len(self.results)) * 100 if self.results else 0
        print(f"\nSuccess Rate: {success_rate:.1f}%")
        
        return len(failed) == 0

def main():
    """Main test execution function"""
    tester = APITester()
    
    try:
        success = tester.run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Tests interrupted by user{Colors.ENDC}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{Colors.RED}Unexpected error: {str(e)}{Colors.ENDC}")
        sys.exit(1)

if __name__ == "__main__":
    main()