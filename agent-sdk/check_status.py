"""
CKS Lite Agent SDK - 状态检查工具
快速检查服务是否正常运行
"""

import sys
import requests
import json

# Fix Windows console encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:7860"

def print_header(text):
    print("\n" + "=" * 60)
    print(text)
    print("=" * 60)

def check_service():
    """检查服务是否运行"""
    print_header("🔍 检查服务状态")

    try:
        response = requests.get(f"{BASE_URL}/", timeout=3)

        if response.status_code == 200:
            data = response.json()
            print("✅ 服务运行正常")
            print(f"   版本: {data.get('version')}")
            print(f"   已加载Skills: {data.get('skills_count')} 个")
            return True
        else:
            print(f"❌ 服务响应异常 (状态码: {response.status_code})")
            return False

    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到服务")
        print(f"   请确保服务已启动: python main.py")
        return False
    except Exception as e:
        print(f"❌ 检查失败: {e}")
        return False

def check_memory():
    """检查记忆系统"""
    print_header("🧠 检查记忆系统")

    try:
        # 尝试搜索记忆
        response = requests.get(
            f"{BASE_URL}/memory/search",
            params={"user_id": "demo_user", "query": "测试", "top_k": 1},
            timeout=5
        )

        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("✅ 记忆系统正常")
                print(f"   找到记忆: {len(result.get('memories', []))} 条")
            else:
                print(f"⚠️ 记忆系统警告: {result.get('error')}")
        else:
            print(f"❌ 记忆系统异常 (状态码: {response.status_code})")

    except Exception as e:
        print(f"❌ 记忆系统检查失败: {e}")

def check_skills():
    """检查Skills"""
    print_header("🛠️ 检查Skills")

    try:
        response = requests.get(f"{BASE_URL}/skills", timeout=5)

        if response.status_code == 200:
            result = response.json()
            skills = result.get('skills', [])

            print(f"✅ Skills加载正常: {len(skills)} 个")

            # 统计不同类型
            ai_skills = sum(1 for s in skills if s.get('has_skill'))
            app_skills = sum(1 for s in skills if s.get('has_app'))
            hybrid_skills = sum(1 for s in skills if s.get('is_hybrid'))

            print(f"   🤖 AI模式: {ai_skills} 个")
            print(f"   📱 应用模式: {app_skills} 个")
            print(f"   🔄 混合模式: {hybrid_skills} 个")

            # 显示前5个
            print("\n   已加载的Skills:")
            for i, skill in enumerate(skills[:5], 1):
                mode = "🔄" if skill.get('is_hybrid') else ("🤖" if skill.get('has_skill') else "📱")
                print(f"     {i}. {mode} {skill['display_name']}")

            if len(skills) > 5:
                print(f"     ... 以及其他 {len(skills) - 5} 个")
        else:
            print(f"❌ Skills检查异常 (状态码: {response.status_code})")

    except Exception as e:
        print(f"❌ Skills检查失败: {e}")

def test_chat():
    """测试对话功能"""
    print_header("💬 测试对话功能")

    try:
        response = requests.post(
            f"{BASE_URL}/chat",
            json={
                "user_id": "status_check",
                "message": "你好",
                "use_memory": False
            },
            timeout=30
        )

        if response.status_code == 200:
            result = response.json()
            message = result.get('message', '')

            if message and not message.startswith("抱歉"):
                print("✅ 对话功能正常")
                print(f"   AI回复: {message[:60]}...")
            else:
                print(f"⚠️ 对话返回警告: {message[:100]}")
        else:
            print(f"❌ 对话测试失败 (状态码: {response.status_code})")

    except Exception as e:
        print(f"❌ 对话测试失败: {e}")

def check_config():
    """检查配置"""
    print_header("⚙️ 配置信息")

    try:
        from pathlib import Path
        from dotenv import load_dotenv
        import os

        # 加载.env文件
        env_path = Path(__file__).parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=True)

            print("✅ 配置文件存在")

            # 显示关键配置(脱敏)
            api_key = os.getenv("ANTHROPIC_API_KEY", "")
            base_url = os.getenv("ANTHROPIC_BASE_URL", "")
            model = os.getenv("MODEL_NAME", "")

            if api_key:
                print(f"   API Key: {api_key[:20]}...{api_key[-10:] if len(api_key) > 30 else ''}")
            if base_url:
                print(f"   Base URL: {base_url}")
            if model:
                print(f"   模型: {model}")

            # 检查数据目录
            data_dir = Path(os.getenv("DATA_DIR", "./data"))
            if data_dir.exists():
                print(f"   数据目录: {data_dir.absolute()}")

                # 检查数据库文件
                db_file = data_dir / "memories.db"
                if db_file.exists():
                    size_mb = db_file.stat().st_size / 1024 / 1024
                    print(f"   数据库大小: {size_mb:.2f} MB")
            else:
                print(f"   ⚠️ 数据目录不存在: {data_dir}")
        else:
            print("⚠️ 配置文件不存在")
            print(f"   请创建: {env_path}")

    except Exception as e:
        print(f"❌ 配置检查失败: {e}")

def main():
    """主函数"""
    print("\n" + "🌟" * 30)
    print("CKS Lite Agent SDK - 状态检查")
    print("🌟" * 30)

    # 检查配置
    check_config()

    # 检查服务
    service_ok = check_service()

    if not service_ok:
        print("\n" + "=" * 60)
        print("❌ 服务未运行，请先启动服务:")
        print("   cd E:\\GalaxyProject\\cks-lite\\agent-sdk")
        print("   .\\venv\\Scripts\\activate")
        print("   python main.py")
        print("=" * 60)
        return

    # 服务运行中，继续检查
    check_skills()
    check_memory()
    test_chat()

    # 总结
    print("\n" + "=" * 60)
    print("✅ 状态检查完成")
    print("=" * 60)
    print("\n访问 http://127.0.0.1:7860/docs 查看API文档")
    print("运行 python test_api.py 进行完整测试\n")

if __name__ == "__main__":
    main()
