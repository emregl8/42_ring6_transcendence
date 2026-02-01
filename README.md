<div align="center">
  <img src="img/transcendence.png" alt="Logo" width="150" height="150">
  <h2>42 LMS Project</h2>
    <a href= https://github.com/emre-mr246/42-evaluation><img src="https://img.shields.io/badge/score-100%20%2F%20100-success?style=for-the-badge"/></a>
    <a href= https://github.com/emre-mr246/42-evaluation><img src="https://img.shields.io/badge/rank-6-magenta?style=for-the-badge"/></a>
    <a href= https://github.com/emre-mr246/42-evaluation><img src="https://img.shields.io/badge/42-Evaluation-red?style=for-the-badge"/></a>
    <a href= https://github.com/emre-mr246/42_ring5_transcendence><img src="https://img.shields.io/github/last-commit/emre-mr246/42_ring5_transcendence?style=for-the-badge"/></a>
    <a href="https://42istanbul.com.tr/"><img src="https://img.shields.io/badge/42-ISTANBUL-white?style=for-the-badge"/></a>
   
<h4>
    <a href="https://github.com/emre-mr246/42_ring5_transcendence/issues">❔ Ask a Question</a>
  <span> · </span>
    <a href="https://github.com/emre-mr246/42_ring5_transcendence/issues">🪲 Report Bug</a>
  <span> · </span>
    <a href="https://github.com/emre-mr246/42_ring5_transcendence/issues">💬 Request Feature</a>
</h4>
</div>


## Introduction 🚀

To be added...

## 42 LMS is a Group Project 🙅🏽‍♀️🙅🏽

In the 42 curriculum, there are various group projects that must be completed with a specified number of participants. For the 42 LMS project, [MısRa](https://github.com/misratasci), [Numan](https://github.com/cankarabulut-db), [Sertan](https://github.com/Sertanbasarici) and [EmRe](https://github.com/emre-mr246) worked together as a team. This collaboration helped us develop our project-based teamwork skills and prepared us to adapt more effectively to future jobs.

## Features 🔍

To be added...

## Installation 🛠️

### 1. Install Prerequisites
```bash
sudo apt install -y curl wget git openssl make npm docker.io
```

### 2. Install k3s
```bash
curl -sfL https://get.k3s.io | sh -
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
echo 'export KUBECONFIG=$HOME/.kube/config' >> ~/.bashrc
source ~/.bashrc
```

### 3. Configure User Permissions
```bash
sudo usermod -aG docker $USER
```
> **Important:** You must restart your computer after running the command above for the changes to take effect.

## Usage ⚙️

### Start the Server
Run the following command to start the development server:
```bash
make dev
```

You can then access the application at: [https://transcendence.local](https://transcendence.local)

> **Note:** Passwords and secrets are randomly generated each time the `.env` file is created.
